# Telemetry and Tracking

## Snowplow Telemetry

Most of the tracking is handled via Snowplow.

### Testing

In order to test the tracking behavior in the local environment you can use [Snowplow Micro](https://gitlab.com/gitlab-org/snowplow-micro-configuration)

Run Snowplow Micro in your terminal:

```shell
podman run --name snowplow-micro --rm -e MICRO_IGLU_REGISTRY_URL="https://gitlab-org.gitlab.io/iglu" -p 127.0.0.1:9090:9090 snowplow/snowplow-micro:latest
```

For more info on Snowplow Micro basic usage, you can visit the [official docs](https://docs.snowplow.io/docs/testing-debugging/snowplow-micro/basic-usage/).

Once this service is up and running you'll have access to the following urls:

- [Good events](http://localhost:9090/micro/good).
- [Bad events](http://localhost:9090/micro/bad). Bad events are Base64 encoded and can be decoded using `base64 -d`.
- [All events](http://localhost:9090/micro/all).
- [Web Interface](http://localhost:9090/micro/ui)

To enable the LSP to send tracking events to the local Snowplow collector, update the client-provided telemetry configuration by setting the `trackingUrl` to the Snowplow Micro URL.

The GitLab for VS Code extension provides a developer-facing option, `gitlab.trackingUrl`, which should be configured in the global VS Code User Settings. In VS Code, go to `Preferences: Open User Settings (JSON)` and add the following line:

`"gitlab.trackingUrl": "http://localhost:9090"`

After that, you will see tracking events coming in one of the categories mentioned above.

### Implementing a new Snowplow tracker

Each domain area should have its own tracker class responsible for tracking, for example

- `quick_chat_showplow_tracker.ts`
- `security_diagnostics_tracker.ts`

Each tracker should implement the `TelemetryService` interface.

The tracker can be invoked directly, but a more generic approach would be to add it to `telemetry_notification_handler.ts` to handle [telemetry notification from the client](https://gitlab.com/gitlab-org/editor-extensions/gitlab-lsp/-/blob/main/docs/supported_messages.md#telemetry).

## Instance Telemetry

While Snowplow data is only available to the internal team, there is another type of telemetry called **Instance Telemetry**, which is tracked directly to the user's GitLab instance instead of the Snowplow collector. Customers have access to this data.

In the Language Server codebase, Instance Telemetry is limited to code suggestion lifecycle events:

- `suggestion_shown`
- `suggestion_accepted`
- `suggestion_rejected`

These events are implemented by the `InstanceTracker` class.

Instance Telemetry events contain **less context** than Snowplow events and are tracked **only for non-streamed code suggestions**.

### How to Test

When telemetry is enabled in your editor and a code suggestion is requested and either accepted or rejected, the Language Server debug logs should contain successful requests to the instance's `api/v4/usage_data/track_event` endpoint.

To verify the data, check the GitLab instance associated with the user. You can use the [GraphQL Explorer](https://gitlab.com/-/graphql-explorer) to run the following query.

Run the query **before triggering events and after** to compare the results.

**Note:** There may be a delay of up to **5 minutes** between a successful POST request and data availability in GraphQL.

#### Example Query

```graphql
{
  group(fullPath: "gitlab-org/editor-extensions") {
    id
    path
    aiMetrics(startDate: "2025-03-11") {
      codeSuggestionsShownCount
      codeSuggestionsAcceptedCount
    }
  }
}
```
