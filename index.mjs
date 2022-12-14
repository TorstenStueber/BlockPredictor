import { ApiPromise, WsProvider } from "@polkadot/api";
import fetch from "node-fetch";
import { SecretsManagerClient, GetSecretValueCommand } from "@aws-sdk/client-secrets-manager";

const POLKADOT_RELAY_CHAIN_RPC_URL = "wss://polkadot.api.onfinality.io/public-ws";

const REFERENCE_BLOCK_NUMBER = 12000000; // 8000000;
const RERFERNCE_BLOCK_TIME = 1662888774011; // 1638703104001;

const AUCTION_START_BLOCK = 13374400;
const LEASE_PERIOD_START_BLOCK = 14238400;

const DRY_RUN = false;

const SECRET_NAME = "SlackBlockPredictor";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

function formatDate(date) {
  const year = String(date.getUTCFullYear()).padStart(2, "0");
  const month = MONTHS[date.getUTCMonth()];
  const day = String(date.getUTCDate()).padStart(2, "0");

  const hour = String(date.getUTCHours()).padStart(2, "0");
  const minute = String(date.getUTCMinutes()).padStart(2, "0");
  const second = String(date.getUTCSeconds()).padStart(2, "0");

  return `${month} ${day}, ${year}, at ${hour}:${minute}:${second} (UTC)`;
}

export const handler = async () => {
  console.log("Block predictor executed");

  const client = DRY_RUN ? undefined : new SecretsManagerClient({ region: "eu-central-1" });
  let webHookPath;
  try {
    const response = DRY_RUN
      ? ""
      : await client.send(
          new GetSecretValueCommand({
            SecretId: SECRET_NAME,
            VersionStage: "AWSCURRENT",
          })
        );

    webHookPath = DRY_RUN ? "" : JSON.parse(response.SecretString).Webhook;
  } catch (error) {
    console.log("Block predictor exception", error);
    throw error;
  }

  const relayChainWsProvider = new WsProvider(POLKADOT_RELAY_CHAIN_RPC_URL);
  const relayChainApi = await ApiPromise.create({ provider: relayChainWsProvider });
  const currentBlock = Number(await relayChainApi.query.system.number());

  const now = Date.now();

  const averageBlockTime = (now - RERFERNCE_BLOCK_TIME) / (currentBlock - REFERENCE_BLOCK_NUMBER);

  const predictedAuctionStartTime = new Date(now + averageBlockTime * (AUCTION_START_BLOCK - currentBlock));
  const predictedLeasePeriodStartTime = new Date(now + averageBlockTime * (LEASE_PERIOD_START_BLOCK - currentBlock));

  const auctionStartString = formatDate(predictedAuctionStartTime);
  const leasePeriodStartString = formatDate(predictedLeasePeriodStartTime);

  console.log("Predicted time", auctionStartString, leasePeriodStartString);

  if (LEASE_PERIOD_START_BLOCK >= currentBlock) {
    const actionStartMessage = `I predict that the *auction starts* on *${auctionStartString}* (block #${AUCTION_START_BLOCK})`;
    const leasePeriodStartMessage = `I predict that *the lease slot starts* on *${leasePeriodStartString}* (block #${LEASE_PERIOD_START_BLOCK})`;

    const message =
      AUCTION_START_BLOCK >= currentBlock
        ? `${actionStartMessage}\n${leasePeriodStartMessage}`
        : leasePeriodStartMessage;

    if (!DRY_RUN) {
      await fetch(`https://hooks.slack.com/services/${webHookPath}`, {
        method: "POST",
        headers: { "Content-type": "application/json" },
        body: JSON.stringify({ text: message }),
      });
    }
  }
};

if (DRY_RUN) handler();
