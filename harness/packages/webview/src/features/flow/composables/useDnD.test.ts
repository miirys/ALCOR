import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { nextTick, ref } from 'vue';
import { setActivePinia, createPinia } from 'pinia';
import { usePersistenceStore } from '../stores';
import type { NodeTypeDefinition } from '../types';

// ═══════════════════════════════════════════════════════════════════
// Mocks
// ═══════════════════════════════════════════════════════════════════

const mockScreenToFlowCoordinate = vi.fn((pos: { x: number; y: number }) => pos);
const mockUpdateNode = vi.fn();
const mockVueFlowRef = ref<HTMLElement | null>(null);

vi.mock('@vue-flow/core', () => ({
  useVueFlow: () => ({
    screenToFlowCoordinate: mockScreenToFlowCoordinate,
    updateNode: mockUpdateNode,
    vueFlowRef: mockVueFlowRef,
  }),
}));

vi.mock('../constants', () => ({
  FLOW_ID: 'test-flow',
}));

vi.mock('../services/FlowMessageBus', () => ({
  getFlowMessageBus: () => ({
    sendRequest: vi.fn(),
    sendNotification: vi.fn(),
    onNotification: vi.fn(),
  }),
  disposeFlowMessageBus: vi.fn(),
}));

vi.mock('../stores/executionStore', () => ({
  useExecutionStore: () => ({
    initializeListeners: vi.fn(),
    fetchContext: vi.fn().mockResolvedValue(undefined),
    startExecution: vi.fn().mockResolvedValue({ success: true }),
    stopExecution: vi.fn(),
    clear: vi.fn(),
    isExecuting: false,
    events: [],
    status: 'idle',
  }),
}));

// ═══════════════════════════════════════════════════════════════════
// Test Helpers
// ═══════════════════════════════════════════════════════════════════

const GHOST_SELECTOR = '[data-testid="dnd-ghost"]';

const TEST_DEFINITIONS: NodeTypeDefinition[] = [
  {
    type: 'agent',
    label: 'Agent',
    description: 'An agent node',
    ui: { color: '#3b82f6', icon: '🤖' },
  },
  {
    type: 'tool',
    label: 'Tool',
    description: 'A tool node',
    ui: { color: '#10b981', icon: '🔧' },
  },
] as NodeTypeDefinition[];

function setupDefinitions(): void {
  const persistenceStore = usePersistenceStore();
  persistenceStore.nodeTypeDefinitions = TEST_DEFINITIONS;
}

function createMockCanvasElement(): HTMLElement {
  const el = document.createElement('div');
  el.getBoundingClientRect = () => ({
    left: 200,
    top: 100,
    right: 800,
    bottom: 600,
    width: 600,
    height: 500,
    x: 200,
    y: 100,
    toJSON: () => {},
  });
  return el;
}

function firePointerEvent(
  target: EventTarget,
  type: string,
  opts: Partial<PointerEvent> = {},
): PointerEvent {
  const event = new PointerEvent(type, {
    clientX: 0,
    clientY: 0,
    button: 0,
    bubbles: true,
    ...opts,
  });
  target.dispatchEvent(event);
  return event;
}

function fireKeyboardEvent(target: EventTarget, key: string): void {
  const event = new KeyboardEvent('keydown', { key, bubbles: true });
  target.dispatchEvent(event);
}

// ═══════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════

// We need to import after mocks are set up
// eslint-disable-next-line import/first
import useDragAndDrop from './useDnD';

describe('useDragAndDrop composable', () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    setupDefinitions();
    mockVueFlowRef.value = createMockCanvasElement();
    mockScreenToFlowCoordinate.mockClear();
    mockScreenToFlowCoordinate.mockImplementation((pos: { x: number; y: number }) => pos);
    mockUpdateNode.mockReset();
  });

  afterEach(() => {
    // Ensure no lingering listeners — trigger cleanup via Escape
    fireKeyboardEvent(document, 'Escape');
    document.body.style.userSelect = '';
    // Remove any leftover ghost elements
    document.querySelectorAll(GHOST_SELECTOR).forEach((el) => el.remove());
  });

  describe('onPointerStart', () => {
    it('sets draggedType and registers listeners', () => {
      const { draggedType, onPointerStart } = useDragAndDrop();

      expect(draggedType.value).toBeUndefined();

      onPointerStart(
        new PointerEvent('pointerdown', { clientX: 100, clientY: 100, button: 0 }),
        'agent',
        'Agent',
        '🤖',
      );

      expect(draggedType.value).toBe('agent');
    });

    it('does NOT start drag on right-click (button !== 0)', () => {
      const { draggedType, onPointerStart } = useDragAndDrop();

      onPointerStart(
        new PointerEvent('pointerdown', { clientX: 100, clientY: 100, button: 2 }),
        'agent',
        'Agent',
        '🤖',
      );

      expect(draggedType.value).toBeUndefined();
    });
  });

  describe('movement threshold', () => {
    it('click without moving does NOT activate drag', () => {
      const { isDragging, onPointerStart } = useDragAndDrop();

      onPointerStart(
        new PointerEvent('pointerdown', { clientX: 100, clientY: 100, button: 0 }),
        'agent',
        'Agent',
        '🤖',
      );

      // Move only 2px — below the 5px threshold
      firePointerEvent(window, 'pointermove', { clientX: 101, clientY: 101 });

      expect(isDragging.value).toBe(false);
    });

    it('moving past threshold activates drag and creates ghost', () => {
      const { isDragging, onPointerStart } = useDragAndDrop();

      onPointerStart(
        new PointerEvent('pointerdown', { clientX: 100, clientY: 100, button: 0 }),
        'agent',
        'Agent',
        '🤖',
      );

      // Move 10px — above the 5px threshold
      firePointerEvent(window, 'pointermove', { clientX: 110, clientY: 100 });

      expect(isDragging.value).toBe(true);

      // Ghost should be appended to document.body
      const ghost = document.body.querySelector(GHOST_SELECTOR);
      expect(ghost).not.toBeNull();
      expect(ghost!.textContent).toContain('Agent');
      expect(ghost!.textContent).toContain('🤖');
    });
  });

  describe('ghost tracking', () => {
    it('ghost follows pointer position on pointermove', () => {
      const { onPointerStart } = useDragAndDrop();

      onPointerStart(
        new PointerEvent('pointerdown', { clientX: 100, clientY: 100, button: 0 }),
        'agent',
        'Agent',
        '🤖',
      );

      // Activate drag
      firePointerEvent(window, 'pointermove', { clientX: 110, clientY: 100 });

      // Move further
      firePointerEvent(window, 'pointermove', { clientX: 300, clientY: 250 });

      const ghost = document.body.querySelector(GHOST_SELECTOR) as HTMLElement | null;
      expect(ghost).not.toBeNull();
      // Ghost is positioned with +12 offset
      expect(ghost!.style.left).toBe('312px');
      expect(ghost!.style.top).toBe('262px');
    });
  });

  describe('isDragOver canvas hit-testing', () => {
    it('isDragOver set true when pointer is over canvas', () => {
      const { isDragOver, onPointerStart } = useDragAndDrop();

      onPointerStart(
        new PointerEvent('pointerdown', { clientX: 100, clientY: 100, button: 0 }),
        'agent',
        'Agent',
        '🤖',
      );

      // Activate drag — move into canvas area (canvas is 200-800 x 100-600)
      firePointerEvent(window, 'pointermove', { clientX: 400, clientY: 300 });

      expect(isDragOver.value).toBe(true);
    });

    it('isDragOver set false when pointer is outside canvas', () => {
      const { isDragOver, onPointerStart } = useDragAndDrop();

      onPointerStart(
        new PointerEvent('pointerdown', { clientX: 50, clientY: 50, button: 0 }),
        'agent',
        'Agent',
        '🤖',
      );

      // Activate drag — move outside canvas area
      firePointerEvent(window, 'pointermove', { clientX: 60, clientY: 50 });

      expect(isDragOver.value).toBe(false);
    });
  });

  describe('drop — pointerup over canvas', () => {
    it('creates node at correct flow coordinates', () => {
      const { onPointerStart } = useDragAndDrop();

      mockScreenToFlowCoordinate.mockReturnValue({ x: 250, y: 350 });

      onPointerStart(
        new PointerEvent('pointerdown', { clientX: 100, clientY: 100, button: 0 }),
        'agent',
        'Agent',
        '🤖',
      );

      // Activate drag — move into canvas
      firePointerEvent(window, 'pointermove', { clientX: 400, clientY: 300 });

      // Drop on canvas
      firePointerEvent(window, 'pointerup', { clientX: 400, clientY: 300 });

      expect(mockScreenToFlowCoordinate).toHaveBeenCalledWith({ x: 400, y: 300 });
    });
  });

  describe('cancellation', () => {
    it('Escape cancels drag — cleans up, no node created', () => {
      const { isDragging, isDragOver, draggedType, onPointerStart } = useDragAndDrop();

      onPointerStart(
        new PointerEvent('pointerdown', { clientX: 100, clientY: 100, button: 0 }),
        'agent',
        'Agent',
        '🤖',
      );

      // Activate drag
      firePointerEvent(window, 'pointermove', { clientX: 400, clientY: 300 });
      expect(isDragging.value).toBe(true);

      // Press Escape
      fireKeyboardEvent(document, 'Escape');

      expect(isDragging.value).toBe(false);
      expect(isDragOver.value).toBe(false);
      expect(draggedType.value).toBeUndefined();

      // Ghost should be removed
      const ghost = document.body.querySelector(GHOST_SELECTOR);
      expect(ghost).toBeNull();
    });

    it('pointerup outside canvas cancels without creating node', () => {
      const { isDragging, onPointerStart } = useDragAndDrop();

      onPointerStart(
        new PointerEvent('pointerdown', { clientX: 50, clientY: 50, button: 0 }),
        'agent',
        'Agent',
        '🤖',
      );

      // Activate drag outside canvas
      firePointerEvent(window, 'pointermove', { clientX: 60, clientY: 50 });
      expect(isDragging.value).toBe(true);

      // Release outside canvas
      firePointerEvent(window, 'pointerup', { clientX: 60, clientY: 50 });

      expect(isDragging.value).toBe(false);
    });

    it('window blur cancels drag', () => {
      const { isDragging, onPointerStart } = useDragAndDrop();

      onPointerStart(
        new PointerEvent('pointerdown', { clientX: 100, clientY: 100, button: 0 }),
        'agent',
        'Agent',
        '🤖',
      );

      // Activate drag
      firePointerEvent(window, 'pointermove', { clientX: 110, clientY: 100 });
      expect(isDragging.value).toBe(true);

      // Simulate window blur (e.g. cursor leaves VS Code webview)
      window.dispatchEvent(new Event('blur'));

      expect(isDragging.value).toBe(false);
      expect(document.body.querySelector(GHOST_SELECTOR)).toBeNull();
    });
  });

  describe('addNodeAtViewportCenter', () => {
    it('computes correct centered position', () => {
      const { addNodeAtViewportCenter } = useDragAndDrop();

      // Canvas rect: left=200, top=100, width=600, height=500
      // Center screen coords: x=500, y=350
      mockScreenToFlowCoordinate.mockReturnValue({ x: 500, y: 350 });

      addNodeAtViewportCenter('agent');

      expect(mockScreenToFlowCoordinate).toHaveBeenCalledWith({ x: 500, y: 350 });
    });

    it('does nothing if vueFlowRef is null', () => {
      mockVueFlowRef.value = null;
      const { addNodeAtViewportCenter } = useDragAndDrop();

      addNodeAtViewportCenter('agent');

      expect(mockScreenToFlowCoordinate).not.toHaveBeenCalled();
    });
  });

  describe('cleanup', () => {
    it('removes listeners after pointerup', () => {
      const { isDragging, onPointerStart } = useDragAndDrop();

      onPointerStart(
        new PointerEvent('pointerdown', { clientX: 100, clientY: 100, button: 0 }),
        'agent',
        'Agent',
        '🤖',
      );

      // Activate and drop
      firePointerEvent(window, 'pointermove', { clientX: 400, clientY: 300 });
      firePointerEvent(window, 'pointerup', { clientX: 400, clientY: 300 });

      expect(isDragging.value).toBe(false);

      // Further pointermove should NOT re-activate
      firePointerEvent(window, 'pointermove', { clientX: 500, clientY: 400 });
      expect(isDragging.value).toBe(false);
    });

    it('removes ghost from DOM after cleanup', () => {
      const { onPointerStart } = useDragAndDrop();

      onPointerStart(
        new PointerEvent('pointerdown', { clientX: 100, clientY: 100, button: 0 }),
        'agent',
        'Agent',
        '🤖',
      );

      // Activate drag to create ghost
      firePointerEvent(window, 'pointermove', { clientX: 110, clientY: 100 });
      expect(document.body.querySelector(GHOST_SELECTOR)).not.toBeNull();

      // End drag
      firePointerEvent(window, 'pointerup', { clientX: 110, clientY: 100 });
      expect(document.body.querySelector(GHOST_SELECTOR)).toBeNull();
    });
  });

  describe('user-select on body', () => {
    it('sets user-select: none on body during drag', async () => {
      const { onPointerStart } = useDragAndDrop();

      onPointerStart(
        new PointerEvent('pointerdown', { clientX: 100, clientY: 100, button: 0 }),
        'agent',
        'Agent',
        '🤖',
      );

      // Activate drag
      firePointerEvent(window, 'pointermove', { clientX: 110, clientY: 100 });

      // Vue watch is async — wait for reactivity flush
      await nextTick();

      expect(document.body.style.userSelect).toBe('none');

      // End drag
      firePointerEvent(window, 'pointerup', { clientX: 110, clientY: 100 });

      await nextTick();

      expect(document.body.style.userSelect).toBe('');
    });
  });
});
