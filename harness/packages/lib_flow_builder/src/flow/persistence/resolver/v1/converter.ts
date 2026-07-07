/* eslint-disable camelcase */
import { err, ok, Result } from 'neverthrow';
import { Service, ServiceLifetime } from '@gitlab/needle';
import { parseContextPath, buildContextPath } from '../../../utils/context_path';
import { computeFlowLayout } from '../../../utils/layout';
import { NodeId } from '../../../utils/node';
import { toComponentName, fromComponentName } from '../../../utils/component_name';
import type {
  Flow,
  FlowId,
  FlowInputField,
  FlowMetadata,
  EdgeId,
  Node,
  AgentNodeConfig,
  ToolNodeConfig,
  AiTaskNodeConfig,
  NodeInput,
  BaseNodeConfig,
  InlinePromptDefinition,
  Edge,
  ParameterBinding,
} from '../../../types';
import { FlowConverter } from '../types';
import { ConversionError } from '../errors';
import { RUNTIME_PROVIDED_VARIABLE_DEFINITIONS } from '../../../registry/context';
import { deriveUiLogEvents } from './utils/ui_log_events';
import { mapZodIssuesToValidationIssues } from './zod_issue_mapper';
import {
  FlowV1Schema,
  validateFlowV1Semantics,
  type FlowV1,
  type Component,
  type ComponentType,
  type AgentComponent,
  type DeterministicStepComponent,
  type OneOffComponent,
  type InlinePrompt,
} from './schema';

const V1_COMPONENT_TYPE_TO_NODE_TYPE: Record<string, string> = {
  DeterministicStepComponent: 'tool',
  AgentComponent: 'agent',
  OneOffComponent: 'ai-task',
};

/**
 * Category used when packing flow input fields into additionalContext for the backend.
 * The backend stores values at state["context"]["inputs"][FLOW_INPUT_CATEGORY][fieldName].
 */
const FLOW_INPUT_CATEGORY = 'flow_input';

/** Top-level context keys that the runtime populates automatically — never wrap as flow inputs. */
const RUNTIME_PROVIDED_CONTEXT_KEYS = new Set(
  RUNTIME_PROVIDED_VARIABLE_DEFINITIONS.map((d) => d.key.split('.')[0]),
);

const VALID_ENVIRONMENTS = ['ambient', 'chat', 'chat-partial'] as const;
type EnvironmentType = (typeof VALID_ENVIRONMENTS)[number];

@Service({
  lifetime: ServiceLifetime.Singleton,
  dependencies: [],
})
export class FlowV1Converter implements FlowConverter {
  readonly version = 'v1';

  toFlow(data: unknown): Result<Flow, ConversionError> {
    const parseResult = FlowV1Schema.safeParse(data);

    if (!parseResult.success) {
      // No internal Flow exists yet, so we can't route to nodes — emit
      // flow-level issues with translated field paths only.
      const issues = mapZodIssuesToValidationIssues(parseResult.error.issues, undefined, undefined);
      return err(ConversionError.schemaValidation('Flow YAML does not match v1 schema', issues));
    }

    const flowV1 = parseResult.data;
    const semanticErrors = validateFlowV1Semantics(flowV1);
    if (semanticErrors.length > 0) {
      return err(
        ConversionError.semanticValidation('Flow has semantic validation errors', semanticErrors),
      );
    }

    try {
      const flow = this.#convertToFlow(flowV1);
      return ok(flow);
    } catch (error) {
      return err(ConversionError.conversionFailed('Failed to convert v1 to Flow', error));
    }
  }

  fromFlow(flow: Flow): Result<unknown, ConversionError> {
    try {
      const nameToId = new Map<string, NodeId>();
      const derivedNames = Object.values(flow.nodes).map((n) => {
        const componentName = toComponentName(n.label);
        return { id: n.id, label: n.label, componentName };
      });

      const emptyNames = derivedNames.filter((n) => n.componentName === '');
      if (emptyNames.length > 0) {
        return err(
          ConversionError.semanticValidation('Node names produce empty component names', [
            `Labels that produce empty component names: ${emptyNames.map((n) => `"${n.label}"`).join(', ')}`,
          ]),
        );
      }

      const seen = new Map<string, string>();
      const collisions: string[] = [];
      for (const { id, label, componentName } of derivedNames) {
        const existing = seen.get(componentName);
        if (existing !== undefined) {
          collisions.push(`"${existing}" and "${label}" both derive to "${componentName}"`);
        } else {
          seen.set(componentName, label);
          nameToId.set(componentName, id);
        }
      }
      if (collisions.length > 0) {
        return err(
          ConversionError.semanticValidation(
            'Node names must produce unique component names',
            collisions,
          ),
        );
      }

      const flowV1 = this.#convertFromFlow(flow);

      const parseResult = FlowV1Schema.safeParse(flowV1);

      if (!parseResult.success) {
        const issues = mapZodIssuesToValidationIssues(parseResult.error.issues, flowV1, nameToId);
        return err(ConversionError.schemaValidation('Generated v1 flow is invalid', issues));
      }

      return ok(flowV1);
    } catch (error) {
      return err(ConversionError.conversionFailed('Failed to convert Flow to v1', error));
    }
  }

  // ==========================================
  // Private: v1 (External) -> Flow (Internal)
  // ==========================================

  #convertToFlow(flowV1: FlowV1): Flow {
    const nameToId = new Map<string, NodeId>();
    const nodes: Record<NodeId, Node> = {};

    const promptMap = new Map<string, InlinePromptDefinition>();
    if (flowV1.prompts) {
      flowV1.prompts.forEach((p) => {
        promptMap.set(p.prompt_id, this.#mapPromptToInternal(p));
      });
    }

    // Collect declared input categories for path unwrapping
    const inputCategories = new Set(flowV1.flow.inputs?.map((i) => i.category) ?? []);

    flowV1.components.forEach((component) => {
      const id = NodeId.create();
      nameToId.set(component.name, id);
      nodes[id] = this.#componentToNode(component, id, promptMap, nameToId, inputCategories);
    });

    const edges: Record<EdgeId, Edge> = {};

    flowV1.routers.forEach((router) => {
      const sourceId = nameToId.get(router.from);

      // Handle Multi-route conditional router
      if (router.condition && router.condition.routes) {
        // Create an edge for EACH route in the map
        Object.entries(router.condition.routes).forEach(([value, targetName]) => {
          if (targetName === 'end') return;

          const targetId = nameToId.get(targetName);
          if (sourceId && targetId) {
            const edgeId = `edge-${sourceId}-${targetId}-${value}` as EdgeId;

            // Reconstruct the simplified condition format: { input, value }
            const condition = JSON.stringify({
              input: router.condition?.input,
              value,
            });

            edges[edgeId] = {
              id: edgeId,
              source: sourceId,
              target: targetId,
              label: value, // Use the value as the label for UI clarity
              condition,
            };
          }
        });
      }
      // Handle Standard 1:1 router
      else {
        if (!router.to || router.to === 'end') return;
        const targetId = nameToId.get(router.to);

        if (sourceId && targetId) {
          const edgeId = `edge-${sourceId}-${targetId}` as EdgeId;
          edges[edgeId] = {
            id: edgeId,
            source: sourceId,
            target: targetId,
            label: router.condition ? 'Conditional' : undefined,
            condition: router.condition ? JSON.stringify(router.condition) : undefined,
          };
        }
      }
    });

    const entryPointId = flowV1.flow.entry_point
      ? nameToId.get(flowV1.flow.entry_point) || null
      : null;

    const inputs = flowV1.flow.inputs
      ? this.#convertInputsToInternal(flowV1.flow.inputs)
      : this.#deriveInputsFromComponents(flowV1.components);

    const metadata: FlowMetadata = {
      environment: flowV1.environment,
    };

    const hasMetadata = Object.values(metadata).some((v) => v !== undefined);

    const flow: Flow = {
      id: 'default' as FlowId,
      entryPoint: entryPointId,
      nodes,
      edges,
      ...(inputs.length > 0 ? { inputs } : {}),
      ...(hasMetadata ? { metadata } : {}),
    };

    const positions = computeFlowLayout(flow);
    for (const [id, position] of Object.entries(positions)) {
      const node = flow.nodes[id as NodeId];
      if (node) node.position = position;
    }

    return flow;
  }

  #componentToNode(
    component: Component,
    id: NodeId,
    promptMap: Map<string, InlinePromptDefinition>,
    nameToId: Map<string, NodeId>,
    inputCategories: Set<string>,
  ): Node {
    const nodeType = this.#mapComponentTypeToNodeType(component.type);

    const baseConfig = {
      inputs: component.inputs?.map((i) => ({
        from: i.from,
        as: i.as,
        literal: i.literal,
        optional: i.optional,
      })),
      uiRoleAs: component.ui_role_as,
    };

    let specificConfig = {};

    switch (component.type) {
      case 'AgentComponent': {
        const promptConfig = this.#resolvePromptConfig(component, promptMap);
        const bindings = this.#inputsToParameterBindings(
          component.inputs,
          nameToId,
          inputCategories,
        );
        const dynamicInputParams =
          promptConfig.promptMode === 'remote'
            ? bindings?.map((b) => b.parameter).filter(Boolean)
            : undefined;
        specificConfig = {
          ...promptConfig,
          parameterBindings: bindings,
          ...(dynamicInputParams?.length ? { dynamicInputParams } : {}),
        } satisfies Omit<AgentNodeConfig, keyof typeof baseConfig>;
        break;
      }

      case 'DeterministicStepComponent':
        specificConfig = {
          toolName: component.tool_name,
          toolset: component.toolset ?? [],
          parameterBindings: this.#inputsToParameterBindings(
            component.inputs,
            nameToId,
            inputCategories,
          ),
        } satisfies Omit<ToolNodeConfig, keyof typeof baseConfig>;
        break;

      case 'OneOffComponent':
        specificConfig = {
          ...this.#resolvePromptConfig(component, promptMap),
          maxCorrectionAttempts: component.max_correction_attempts,
          parameterBindings: this.#inputsToParameterBindings(
            component.inputs,
            nameToId,
            inputCategories,
          ),
        } satisfies Omit<AiTaskNodeConfig, keyof typeof baseConfig>;
        break;
      default:
        break;
    }

    return {
      id,
      type: nodeType,
      label: fromComponentName(component.name),
      position: { x: 0, y: 0 },
      config: { ...baseConfig, ...specificConfig },
      sourceComponentName: component.name,
    };
  }

  // ==========================================
  // Private: Flow (Internal) -> v1 (External)
  // ==========================================

  #convertFromFlow(flow: Flow): FlowV1 {
    const idToName = new Map<NodeId, string>();
    Object.values(flow.nodes).forEach((node) => {
      idToName.set(node.id, toComponentName(node.label));
    });

    const flowInputCategories = new Map<string, string>();
    for (const input of flow.inputs ?? []) {
      if (!RUNTIME_PROVIDED_CONTEXT_KEYS.has(input.name)) {
        flowInputCategories.set(input.name, input.category ?? FLOW_INPUT_CATEGORY);
      }
    }
    const prompts: InlinePrompt[] = [];

    const components = Object.values(flow.nodes).map((node) =>
      this.#nodeToComponent(node, prompts, idToName, flowInputCategories),
    );

    const routers = this.#buildRouters(flow, idToName);
    const entryPointName = flow.entryPoint ? idToName.get(flow.entryPoint) || '' : '';

    const v1Inputs = this.#convertInputsToV1(flow.inputs);

    const rawEnv = flow.metadata?.environment;
    const environment: EnvironmentType = VALID_ENVIRONMENTS.includes(rawEnv as EnvironmentType)
      ? (rawEnv as EnvironmentType)
      : 'ambient';

    return {
      version: 'v1',
      environment,
      components,
      routers,
      flow: {
        entry_point: entryPointName,
        ...(flow.inputs !== undefined ? { inputs: v1Inputs } : {}),
      },
      prompts: prompts.length > 0 ? prompts : undefined,
    };
  }

  #nodeToComponent(
    node: Node,
    promptsAccumulator: InlinePrompt[],
    idToName: Map<NodeId, string>,
    flowInputCategories: Map<string, string>,
  ): Component {
    const nodeType = node.type;

    const componentName = toComponentName(node.label);
    const createBase = (type: string) => ({
      name: componentName,
      type,
    });

    const config = node.config || {};

    switch (nodeType) {
      case 'agent': {
        const c = config as AgentNodeConfig;
        const baseFields = this.#extractBaseComponentFields(c, 'AgentComponent');

        const agentBaseFields = c.parameterBindings
          ? {
              ...baseFields,
              inputs: this.#parameterBindingsToInputs(
                c.parameterBindings,
                idToName,
                flowInputCategories,
              ),
            }
          : baseFields;

        return {
          ...createBase('AgentComponent'),
          ...this.#buildPromptComponentFields(c, componentName, promptsAccumulator),
          ...agentBaseFields,
        } as AgentComponent;
      }
      case 'tool': {
        const c = config as ToolNodeConfig;
        const baseFields = this.#extractBaseComponentFields(c, 'DeterministicStepComponent');
        const toolBaseFields = c.parameterBindings
          ? {
              ...baseFields,
              inputs: this.#parameterBindingsToInputs(
                c.parameterBindings,
                idToName,
                flowInputCategories,
              ),
            }
          : baseFields;
        return {
          ...createBase('DeterministicStepComponent'),
          tool_name: c.toolName || '',
          toolset: c.toolset ?? [],
          ...toolBaseFields,
        } as DeterministicStepComponent;
      }
      case 'ai-task': {
        const c = config as AiTaskNodeConfig;
        const baseFields = this.#extractBaseComponentFields(c, 'OneOffComponent');

        const aiTaskBaseFields = c.parameterBindings
          ? {
              ...baseFields,
              inputs: this.#parameterBindingsToInputs(
                c.parameterBindings,
                idToName,
                flowInputCategories,
              ),
            }
          : baseFields;

        return {
          ...createBase('OneOffComponent'),
          ...this.#buildPromptComponentFields(c, componentName, promptsAccumulator),
          max_correction_attempts: c.maxCorrectionAttempts,
          ...aiTaskBaseFields,
        } as OneOffComponent;
      }
      default:
        throw new Error(`Unknown node type: ${nodeType}`);
    }
  }

  #resolvePromptConfig(
    component: AgentComponent | OneOffComponent,
    promptMap: Map<string, InlinePromptDefinition>,
  ) {
    const isLocal = promptMap.has(component.prompt_id);
    return {
      promptMode: (isLocal ? 'local' : 'remote') as 'local' | 'remote',
      promptId: component.prompt_id,
      promptVersion: !isLocal ? (component.prompt_version ?? undefined) : undefined,
      localPrompt: isLocal ? promptMap.get(component.prompt_id) : undefined,
      toolset: component.toolset ?? [],
    };
  }

  #buildPromptComponentFields(
    config: AgentNodeConfig | AiTaskNodeConfig,
    componentName: string,
    promptsAccumulator: InlinePrompt[],
  ) {
    const isRemote = config.promptMode === 'remote';

    if (!isRemote && config.localPrompt) {
      const localPromptId = `${componentName}_prompt`;
      promptsAccumulator.push(this.#mapPromptToExternal(config.localPrompt, localPromptId));
      return {
        prompt_id: localPromptId,
        prompt_version: null,
        toolset: config.toolset ?? [],
      };
    }

    return {
      prompt_id: config.promptId || '',
      prompt_version: isRemote ? config.promptVersion || null : null,
      toolset: config.toolset ?? [],
    };
  }

  #extractBaseComponentFields(config: BaseNodeConfig, componentType: ComponentType) {
    return {
      inputs: config.inputs?.map(this.#mapInputToV1),
      ui_log_events: deriveUiLogEvents(componentType),
      ui_role_as: config.uiRoleAs,
    };
  }

  #mapInputToV1(input: NodeInput) {
    return {
      from: input.from,
      as: input.as,
      literal: input.literal,
      optional: input.optional,
    };
  }

  #buildRouters(flow: Flow, idToName: Map<NodeId, string>): FlowV1['routers'] {
    const routers: FlowV1['routers'] = [];

    // 1. Group Edges by Source ID
    const edgesBySource = new Map<NodeId, Edge[]>();
    Object.values(flow.edges).forEach((edge) => {
      const existing = edgesBySource.get(edge.source) || [];
      existing.push(edge);
      edgesBySource.set(edge.source, existing);
    });

    // 2. Process each group to separate mergeable conditionals from others
    edgesBySource.forEach((edges, sourceId) => {
      const sourceName = idToName.get(sourceId);
      if (!sourceName) return;

      // Map<InputVariable, Array<{ value: string, target: string }>>
      const conditionalGroups = new Map<string, { value: string; target: string }[]>();
      const standaloneEdges: Edge[] = [];

      edges.forEach((edge) => {
        const targetName = idToName.get(edge.target);
        if (!targetName) return; // Skip dangling edges

        let merged = false;
        if (edge.condition) {
          try {
            const parsed = JSON.parse(edge.condition);
            // Check if it matches the simplified format { input, value }
            if (parsed.input && parsed.value) {
              const group = conditionalGroups.get(parsed.input) || [];
              group.push({ value: parsed.value, target: targetName });
              conditionalGroups.set(parsed.input, group);
              merged = true;
            }
          } catch {
            // Fallthrough to standalone if parsing fails
          }
        }

        if (!merged) {
          standaloneEdges.push(edge);
        }
      });

      // 3. Construct Routers for Merged Conditionals
      conditionalGroups.forEach((routes, input) => {
        const routesMap: Record<string, string> = {};
        routes.forEach((r) => {
          routesMap[r.value] = r.target;
        });

        routers.push({
          from: sourceName,
          condition: {
            input,
            routes: routesMap,
          },
        });
      });

      // 4. Construct Routers for Standalone Edges
      standaloneEdges.forEach((edge) => {
        const targetName = idToName.get(edge.target);
        if (!targetName) return;

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const router: any = {
          from: sourceName,
          to: targetName,
        };

        if (edge.condition) {
          try {
            router.condition = JSON.parse(edge.condition);
          } catch (e) {
            // eslint-disable-next-line no-console
            console.warn(`Failed to parse condition for edge ${edge.id}`, e);
          }
        }
        routers.push(router);
      });
    });

    // 5. Add Implicit End routers for terminal nodes
    // Note: We must check if a node acts as a source in ANY generated router
    const activeSources = new Set(routers.map((r) => r.from));

    Object.values(flow.nodes).forEach((node) => {
      const name = idToName.get(node.id);
      if (!name) return;
      // If node is not a source in our constructed routers (meaning no outgoing edges), route to end
      if (!activeSources.has(name)) {
        routers.push({ from: name, to: 'end' });
      }
    });

    return routers;
  }

  /**
   * Convert V1 inputs to ParameterBindings.
   * Each V1 input becomes a binding: literal inputs → 'literal' kind,
   * context references → 'reference' kind.
   *
   * Reference paths are translated from component-name-based (V1) to ID-based (internal):
   *   "context:analyzer.findings" → "context:{analyzer-uuid}.findings"
   */
  #inputsToParameterBindings(
    inputs: { from: string; as?: string; literal?: boolean; optional?: boolean }[] | undefined,
    nameToId: Map<string, NodeId>,
    inputCategories: Set<string>,
  ): ParameterBinding[] | undefined {
    if (!inputs || inputs.length === 0) return undefined;

    return inputs.map((input) => {
      const parameter = input.as || input.from.split('.').pop() || input.from;

      if (input.literal) {
        // V1 serializes all literal values as strings. We attempt a JSON.parse
        // to recover typed data that was round-tripped through YAML.
        // Promoted types: objects, arrays, booleans, numbers, null.
        // Strings that parse as strings (e.g. JSON `"hello"`) are kept as-is
        // since the original string value is already correct.
        let literalValue: unknown = input.from;
        try {
          const parsed = JSON.parse(input.from);
          if (typeof parsed !== 'string') {
            literalValue = parsed;
          }
        } catch {
          // Not JSON — keep as string
        }

        return {
          parameter,
          kind: 'literal' as const,
          literalValue,
          ...(input.optional ? { optional: true } : {}),
        };
      }

      return {
        parameter,
        kind: 'reference' as const,
        referencePath: this.#translateRefPathToIds(input.from, nameToId, inputCategories),
        ...(input.optional ? { optional: true } : {}),
      };
    });
  }

  /**
   * Convert ParameterBindings back to V1 inputs.
   * V1 from is strictly a string, so structured values get JSON.stringify'd.
   *
   * Reference paths are translated from ID-based (internal) to label-based (V1):
   *   "context:{analyzer-uuid}.findings" → "context:analyzer.findings"
   */
  #parameterBindingsToInputs(
    bindings: ParameterBinding[],
    idToName: Map<NodeId, string>,
    flowInputCategories: Map<string, string>,
  ): { from: string; as?: string; literal?: boolean; optional?: boolean }[] | undefined {
    const inputs = bindings
      .filter((b) => b.kind !== 'unbound')
      .map((binding) => {
        if (binding.kind === 'literal') {
          const fromValue =
            binding.literalValue === null || typeof binding.literalValue === 'object'
              ? JSON.stringify(binding.literalValue)
              : String(binding.literalValue);

          return {
            from: fromValue,
            as: binding.parameter,
            literal: true,
            ...(binding.optional ? { optional: true } : {}),
          };
        }

        // kind === 'reference'
        return {
          from: this.#translateRefPathToLabels(
            binding.referencePath ?? '',
            idToName,
            flowInputCategories,
          ),
          as: binding.parameter,
          ...(binding.optional ? { optional: true } : {}),
        };
      });

    return inputs.length > 0 ? inputs : undefined;
  }

  /**
   * Translate a V1 reference path from label-based to ID-based.
   * "context:analyzer.findings" → "context:{analyzer-id}.findings"
   *
   * Flow input paths are simplified from the backend's nested format:
   *   "context:inputs.<category>.field_name" → "context:field_name"
   */
  #translateRefPathToIds(
    path: string,
    nameToId: Map<string, NodeId>,
    inputCategories: Set<string>,
  ): string {
    const ref = parseContextPath(path);
    if (!ref) return path;

    // Unwrap flow input paths: context:inputs.<category>.<field> → context:<field>
    if (ref.root === 'inputs' && ref.field) {
      const dotIndex = ref.field.indexOf('.');
      if (dotIndex > 0) {
        const category = ref.field.slice(0, dotIndex);
        if (inputCategories.has(category)) {
          const fieldName = ref.field.slice(dotIndex + 1);
          return buildContextPath(fieldName, undefined);
        }
      }
    }

    const nodeId = nameToId.get(ref.root);
    return nodeId ? buildContextPath(nodeId, ref.field) : path;
  }

  /**
   * Translate an internal reference path from ID-based to label-based for V1.
   * "context:{analyzer-id}.findings" → "context:analyzer.findings"
   *
   * Flow input paths are expanded to the backend's nested format:
   *   "context:user_name" → "context:inputs.flow_input.user_name"
   */
  #translateRefPathToLabels(
    path: string,
    idToName: Map<NodeId, string>,
    flowInputCategories: Map<string, string>,
  ): string {
    const ref = parseContextPath(path);
    if (!ref) return path;

    const nodeName = idToName.get(ref.root as NodeId);
    if (nodeName) return buildContextPath(nodeName, ref.field);

    // Wrap declared flow input references for the backend state path
    // "context:user_name" → "context:inputs.<category>.user_name"
    const category = !ref.field ? flowInputCategories.get(ref.root) : undefined;
    if (category) {
      return buildContextPath('inputs', `${category}.${ref.root}`);
    }

    return path;
  }

  #mapComponentTypeToNodeType(componentType: string): string {
    const nodeType = V1_COMPONENT_TYPE_TO_NODE_TYPE[componentType];
    if (!nodeType) {
      throw new Error(`Unknown v1 component type: ${componentType}`);
    }
    return nodeType;
  }

  #mapPromptToInternal(prompt: InlinePrompt): InlinePromptDefinition {
    return {
      name: prompt.name,
      promptTemplate: {
        system: prompt.prompt_template.system,
        user: prompt.prompt_template.user,
      },
      params: prompt.params
        ? {
            timeout: prompt.params.timeout,
            stop: prompt.params.stop,
            vertexLocation: prompt.params.vertex_location,
          }
        : undefined,
    };
  }

  #mapPromptToExternal(prompt: InlinePromptDefinition, id: string): InlinePrompt {
    return {
      prompt_id: id,
      name: prompt.name || id,
      unit_primitives: [],
      prompt_template: {
        system: prompt.promptTemplate.system,
        user: prompt.promptTemplate.user,
        placeholder: 'history',
      },
      params: prompt.params
        ? {
            timeout: prompt.params.timeout,
            stop: prompt.params.stop,
            vertex_location: prompt.params.vertexLocation,
          }
        : undefined,
    };
  }

  // ==========================================
  // Private: Flow Inputs Conversion
  // ==========================================

  #convertInputsToInternal(
    v1Inputs?: {
      category: string;
      input_schema: Record<string, { type: string; format?: string; description?: string }>;
    }[],
  ): FlowInputField[] {
    if (!v1Inputs || v1Inputs.length === 0) return [];

    const fields: FlowInputField[] = [];
    for (const group of v1Inputs) {
      for (const [name, def] of Object.entries(group.input_schema)) {
        fields.push({
          name,
          type: def.type,
          format: def.format,
          description: def.description,
          category: group.category,
        });
      }
    }
    return fields;
  }

  #convertInputsToV1(inputs?: FlowInputField[]): {
    category: string;
    input_schema: Record<string, { type: string; format?: string; description?: string }>;
  }[] {
    if (!inputs || inputs.length === 0) return [];

    const groups = new Map<
      string,
      Record<string, { type: string; format?: string; description?: string }>
    >();

    for (const field of inputs) {
      const category = field.category ?? FLOW_INPUT_CATEGORY;
      let schema = groups.get(category);
      if (!schema) {
        schema = {};
        groups.set(category, schema);
      }
      schema[field.name] = {
        type: field.type,
        ...(field.format ? { format: field.format } : {}),
        ...(field.description ? { description: field.description } : {}),
      };
    }

    return Array.from(groups.entries()).map(([category, input_schema]) => ({
      category,
      input_schema,
    }));
  }

  #deriveInputsFromComponents(components: Component[]): FlowInputField[] {
    const componentNames = new Set(components.map((c) => c.name));
    const requiredInputs = new Map<string, FlowInputField>();

    components.forEach((component) => {
      if (!component.inputs) return;

      component.inputs.forEach((input) => {
        const ref = parseContextPath(input.from);
        if (!ref) return;

        // If the variable doesn't match a component name, it's a top-level workflow input
        if (!componentNames.has(ref.root)) {
          const varName = ref.field ? `${ref.root}.${ref.field}` : ref.root;
          if (!requiredInputs.has(varName)) {
            requiredInputs.set(varName, {
              name: varName,
              type: 'string',
            });
          }
        }
      });
    });

    return Array.from(requiredInputs.values());
  }
}
