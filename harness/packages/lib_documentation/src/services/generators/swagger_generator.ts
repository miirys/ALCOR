import { Injectable } from '@gitlab/needle';
import {
  ClientToServerOpenApiSchemaGenerator,
  DualSwaggerHtmlGenerator,
  ServerToClientOpenApiSchemaGenerator,
  SwaggerHtmlGenerator,
} from '../../types';

const SWAGGER_VERSION = '5.11.0';
const SWAGGER_CSS_URL = `https://unpkg.com/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui.css`;
const SWAGGER_BUNDLE_URL = `https://unpkg.com/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui-bundle.js`;
const SWAGGER_STANDALONE_URL = `https://unpkg.com/swagger-ui-dist@${SWAGGER_VERSION}/swagger-ui-standalone-preset.js`;

@Injectable(DualSwaggerHtmlGenerator, [
  ClientToServerOpenApiSchemaGenerator,
  ServerToClientOpenApiSchemaGenerator,
])
export class DefaultDualSwaggerHtmlGenerator implements SwaggerHtmlGenerator {
  #clientSchemaGenerator: ClientToServerOpenApiSchemaGenerator;

  #serverSchemaGenerator: ServerToClientOpenApiSchemaGenerator;

  constructor(
    clientSchemaGenerator: ClientToServerOpenApiSchemaGenerator,
    serverSchemaGenerator: ServerToClientOpenApiSchemaGenerator,
  ) {
    this.#clientSchemaGenerator = clientSchemaGenerator;
    this.#serverSchemaGenerator = serverSchemaGenerator;
  }

  generateSwagger(): string {
    const clientSchema = this.#clientSchemaGenerator.generateSchema();
    const serverSchema = this.#serverSchemaGenerator.generateSchema();
    return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>GitLab Language Server - Dual Swagger Documentation</title>
  <link rel="stylesheet" href="${SWAGGER_CSS_URL}">
  <style>
    body {
      margin: 0px !important;
    }

    .swagger-ui .information-container hgroup a {
      display: none !important;
    }

    #schema-selector-wrapper {
      flex: 1;
      display: flex;
      align-items: center;
      justify-content: right;
    }

    #schema-selector {
      margin: 10px;
      font-size: 14px;
      padding: 8px;
      border: 1px solid #ddd;
      border-radius: 4px;
      background-color: #f8f8f8;
      cursor: pointer;
    }

    #top-bar {
      position: sticky;
      top: 0;
      z-index: 1000;
      padding: 10px;
      border-bottom: 1px solid #444;
      background-color: #2d2d2d; /* Dark background */
      color: #ffffff; /* White text for contrast */
      display: flex;
      align-items: center;
    }

    #title-container {
      display: flex;
      align-items: center;
      gap: 1em;
      font-size: 1.3em;
    }

  </style>
</head>
<body>
  <div id="top-bar">
    <a id="title-container">
      <span>
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 25 24" height="24" width="25" class="tanuki-logo" role="img" aria-hidden="true">
          <path fill="#E24329" d="m24.507 9.5-.034-.09L21.082.562a.896.896 0 0 0-1.694.091l-2.29 7.01H7.825L5.535.653a.898.898 0 0 0-1.694-.09L.451 9.411.416 9.5a6.297 6.297 0 0 0 2.09 7.278l.012.01.03.022 5.16 3.867 2.56 1.935 1.554 1.176a1.051 1.051 0 0 0 1.268 0l1.555-1.176 2.56-1.935 5.197-3.89.014-.01A6.297 6.297 0 0 0 24.507 9.5Z" class="tanuki-shape tanuki"></path>
          <path fill="#FC6D26" d="m24.507 9.5-.034-.09a11.44 11.44 0 0 0-4.56 2.051l-7.447 5.632 4.742 3.584 5.197-3.89.014-.01A6.297 6.297 0 0 0 24.507 9.5Z" class="tanuki-shape right-cheek"></path>
          <path fill="#FCA326" d="m7.707 20.677 2.56 1.935 1.555 1.176a1.051 1.051 0 0 0 1.268 0l1.555-1.176 2.56-1.935-4.743-3.584-4.755 3.584Z" class="tanuki-shape chin"></path>
          <path fill="#FC6D26" d="M5.01 11.461a11.43 11.43 0 0 0-4.56-2.05L.416 9.5a6.297 6.297 0 0 0 2.09 7.278l.012.01.03.022 5.16 3.867 4.745-3.584-7.444-5.632Z" class="tanuki-shape left-cheek"></path>
        </svg>
      </span>
      <span>
        GitLab Language Server
      </span>
    </a>

    <div id="schema-selector-wrapper">
      <label for="schema-selector"><strong>Select API Schema:</strong></label>
      <select id="schema-selector">
        <option value="client">Client To Server API</option>
        <option value="server">Server To Client API</option>
      </select>
    </div>
  </div>
  <div id="swagger-container"></div>
  <script src="${SWAGGER_BUNDLE_URL}"></script>
  <script src="${SWAGGER_STANDALONE_URL}"></script>
  <script>
    const clientSchema = ${JSON.stringify(clientSchema)};
    const serverSchema = ${JSON.stringify(serverSchema)};

    let currentSwaggerUI;

    // Function to initialize Swagger UI with the selected schema
    function loadSwagger(schema) {
      if (currentSwaggerUI) {
        // Cleanup the existing instance before loading a new one
        document.getElementById('swagger-container').innerHTML = '';
      }

      currentSwaggerUI = SwaggerUIBundle({
        spec: schema,
        dom_id: '#swagger-container',
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIStandalonePreset],
        plugins: [SwaggerUIBundle.plugins.DownloadUrl],
        layout: "BaseLayout",
        displaySearch: false,
        supportedSubmitMethods: [] // Disable all "Try it out" options
      });
    }

    // Initial load with the Client Schema
    window.onload = function() {
      loadSwagger(clientSchema);

      // Handle schema switching
      document.getElementById('schema-selector').addEventListener('change', function(event) {
        const selectedSchema = event.target.value;
        if (selectedSchema === 'client') {
          loadSwagger(clientSchema);
        } else if (selectedSchema === 'server') {
          loadSwagger(serverSchema);
        }
      });
    };
  </script>
</body>
</html>
    `;
  }
}
