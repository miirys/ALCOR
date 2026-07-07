export type SchemaInfo = {
  title: string;
  version: string;
};

export type GeneratorConfig = {
  outputDir: string;
  version: string;
};

export type SchemaContent = {
  schema: string;
  type: 'server-to-client' | 'client-to-server';
};
