import { Injectable } from '@gitlab/needle';
import { TreeSitterParser } from '../../tree_sitter';
import { AbstractPostProcessorPipeline, PostProcessorPipeline } from './post_processor_pipeline';
import { JsonUrlProcessor } from './url_sanitization/json_url_processor';
import { UrlSanitizationPostProcessor } from './url_sanitization/url_sanitization_post_processor';
import { YamlUrlProcessor } from './url_sanitization/yaml_url_processor';

/*
  This is the bootstrapping code for postprocessor pipeline. It's configured to be injected into the
  suggestion client or other places where postprocessors are needed.
*/
@Injectable(PostProcessorPipeline, [TreeSitterParser])
export class DefaultPostProcessorPipeline extends AbstractPostProcessorPipeline {
  constructor(treeSitter: TreeSitterParser) {
    super();

    const urlSanitizationProcessor = new UrlSanitizationPostProcessor();
    urlSanitizationProcessor.addProcessor('json', new JsonUrlProcessor(treeSitter));
    urlSanitizationProcessor.addProcessor('yaml', new YamlUrlProcessor());

    this.addProcessor(urlSanitizationProcessor);
  }
}
