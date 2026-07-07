# Asciinema Setup

We use a self-hosted [asciinema](https://asciinema.org) server at <https://asciinema.duo-cli-testing.com/> to store terminal session recordings.

## Getting an Account

1. Go to <https://asciinema.duo-cli-testing.com/> and click **Sign in**. Enter your work email.
1. The server doesn't send emails. Instead, open the server logs at
   <https://gitlab.com/gitlab-org/editor-extensions/experiments/asciinema-server/-/logs>
   and find the recent log line:

   ```plaintext
   [info] url from email: https://asciinema.duo-cli-testing.com/users/new?...
   ```

1. Open that URL and choose your username.
1. Authenticate your local CLI:

   ```shell
   asciinema auth
   ```

   This prints a URL like `https://asciinema.duo-cli-testing.com/connect/<id>`. Open it in a browser where you're logged into asciinema to link the CLI to your account.

## Recording and Uploading

```shell
asciinema rec demo.cast    # record a session (exit or Ctrl+D to stop)
asciinema upload demo.cast # upload the recording
```

## CI and Agent Accounts

The CI pipeline and the Duo Developer agent use pre-configured accounts:

- **CI** (`tvik+ci@gitlab.com`) — used in `cli-e2e-test` jobs - ID stored in CI/CD variables
- **Duo Developer agent** (`tvik+agent@gitlab.com`) — used in `.gitlab/duo/agent-config.yml`
