# Self-hosting OpenChar

OpenChar runs as three containers on one machine: Postgres, the API, and the
web app. The web app is the only part people open in a browser. It talks to
the API over the machine's internal network, and the API talks to the
database.

```
browser ──> web (Next.js, :3000) ──> api (Fastify, :8080) ──> Postgres
                                       └── evidence files (a Docker volume)
```

## What you need

- A Linux server or a laptop with Docker and Docker Compose.
- About 2 GB of RAM and 20 GB of free disk space for one plant, which covers
  all three containers with spare capacity. For comparison, the hosted
  service runs its API and database on 2 virtual CPUs and 1 GB of RAM, with
  the web app on a separate server.
- A domain name, if people will reach it over the internet.

## Install

```bash
git clone https://github.com/CarbonMarketsHQ/openchar.git
cd openchar
cp .env.example .env
```

In `.env`, set `API_TOKEN` and `POSTGRES_PASSWORD` to long random strings
(`openssl rand -hex 24` prints one). Set `APP_URL` to the address people will
use, because links in emails point there. Then:

```bash
docker compose up -d
```

On a laptop, open http://localhost:3000. On a remote server the web app
listens only on localhost by default, so set up HTTPS first (next section) or
connect your own reverse proxy, then open your `APP_URL`.

When the database is empty, the sign-in page takes you to a setup screen where
you create the first workspace and its admin account. After that, sign-up
turns off, and the admin invites everyone else from the Account page.

To create the first admin from the command line instead, run the command
below. It prints a link the admin opens in a browser to set a password:

```bash
docker compose exec api npm run admin -- create-admin you@example.org "Your Name" "Your Organisation"
```

## HTTPS

Point a DNS A record for your domain to the server's IP address, set `DOMAIN`
in `.env`, and start the included Caddy reverse proxy. Caddy requests and
renews free HTTPS certificates from Let's Encrypt automatically:

```bash
docker compose --profile tls up -d
```

Ports 80 and 443 must be open to the internet in the server's firewall. The
web app and API still listen only on localhost, so all outside traffic passes
through Caddy. If you already run your own reverse proxy or load balancer,
start with plain `docker compose up -d` and forward traffic to
`127.0.0.1:3000`.

## Email

OpenChar sends two kinds of email: password resets and team invitations.
Without a mailer it still works. The admin who invites someone sees the
invite link on screen and passes it on, and reset links are written to the
API log:

```bash
docker compose logs api | grep -A4 '\[mail\]'
```

To send email, set `MAIL_WEBHOOK_URL` to an HTTP endpoint you control.
OpenChar sends it a `POST` request with a JSON body containing `to`,
`subject`, `text` and `link`, and your endpoint passes the message to your
email provider.

With or without a mailer, an administrator can create a password reset link
from the command line at any time:

```bash
docker compose exec api npm run admin -- reset-link someone@example.org
```

## Settings

All settings live in `.env`. Only the first two are required.

| Setting | What it does |
|---|---|
| `API_TOKEN` | Shared secret between the web app and the API. The API refuses to start without it. |
| `POSTGRES_PASSWORD` | Database password. |
| `APP_URL` | The address people use. Links in emails point here. |
| `SIGNUP_MODE` | `closed` (default): only the first account signs up, everyone else is invited. `open`: anyone who can reach the server can create a workspace. |
| `MAIL_WEBHOOK_URL` | Where to post outgoing email as JSON. Empty means links go to the API log. |
| `CALIBRATION_ALERT_EMAILS` | `1` emails workspace admins when an instrument's calibration is due within 30 days or has lapsed. Off by default. |
| `DOMAIN` | Your domain, for the `tls` profile. |
| `PUBLIC_PROJECT_ID` | The project shown at `/public`. It must also be published from the Projects page. Any published project is also at `/public/<project id>`. |
| `ISOMETRIC_API_KEY`, `ISOMETRIC_CLIENT_SECRET` | Isometric Certify credentials. Without them, the registry connector builds the submission and shows it for review, but does not send it. |
| `API_BIND`, `WEB_BIND` | Interface the API and web ports listen on. `127.0.0.1` (default) keeps them off the network. |
| `AUTH_RATE_MAX` | Sign-in attempts allowed per minute from one IP address (default 15). |

## Plant sensors

OpenChar can receive live reactor readings from an MQTT message broker (MQTT
is the messaging protocol most plant sensors and gateways use). On the
Facilities page, choose **Connect sensors** and enter the broker URL and the
topic name. Each message must be JSON that names its batch, for example
`{"batchCode": "HT-04", "minute": 12, "tempC": 548.2}`, and OpenChar attaches
the reading to that batch. Plants without a broker export the temperature log
from the reactor controller (PLC) as a CSV file, one minute and temperature per
row, and upload it on the batch page.

## Backups

On a Linux server, install the nightly backup timer once:

```bash
sudo bash deploy/backup/install.sh
```

Each night it saves a copy of the database and the evidence files into
`./backups`, keeps the last seven backups, and records the run so the Account
page shows when the last successful backup finished. Set `BACKUP_BUCKET` in `.env` to also copy each
backup to an S3 bucket (the server needs the AWS CLI and write access to the
bucket).

Test regularly that a backup can be restored:

```bash
bash deploy/backup/restore-drill.sh
```

The script restores the latest backup into a temporary database, compares
its row counts with the live database, and then deletes the temporary one.

## Upgrades

Before upgrading, take a backup, read the release notes, and upgrade one
release at a time. Then pull the new code, rebuild the containers, and remove
the old images so they do not fill the disk:

```bash
git pull
docker compose up -d --build
docker image prune -f
```

The API applies any database changes itself when it starts.

## Your data

Everything OpenChar holds is in two Docker volumes, named `biochar-db` (the
database) and `openchar-files` (the evidence files) in the compose file. The
backup files above are a complete, portable copy: a standard Postgres dump and
an archive of the files. The reactor readings of any batch also download from
the batch page in the registry's Parquet format or as JSON.

## Move a workspace to another server

A workspace admin can download a full copy of the workspace from the Account page, under Your data. The ZIP file contains every table (as JSON and CSV) and every uploaded file. It does not include passwords, sign-in sessions or the sign-in log. You can also download this copy from a workspace on the hosted service at openchar.carbonmarketshq.com.

To load the ZIP file into your own server, copy it into the `api` container and import it:

```bash
docker compose cp openchar-copy.zip api:/tmp/copy.zip
docker compose exec api npm run admin -- import-workspace /tmp/copy.zip
```

The import checks every file against its SHA-256 hash and verifies the hash chain of the field app records. It stops without writing anything if the workspace already exists on the server, or if anyone in it already has an account. When it finishes, it prints a link for each person to set a new password. The links expire after seven days.
