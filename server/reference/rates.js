/**
 * Published list prices, as a dated snapshot.
 *
 * Why this file exists at all: the tools are pure functions with no I/O, so
 * they cannot read prices out of Postgres. Every default rate a tool uses is
 * declared here, carries a source URL and a retrieval date, and is echoed into
 * the student's assumption log so the number they relied on is on the record.
 *
 * This does NOT discharge the student's obligation. The syllabus requires each
 * student to retrieve and date their own prices. These figures exist so the
 * class has a worked example of what a properly dated price record looks like,
 * and so a Week 1 sizing answer can be denominated in dollars instead of GiB.
 *
 * Every figure is a US-region, on-demand, list price with no negotiated
 * discount applied. List price is the honest starting point precisely because
 * it is the worst price anybody pays.
 *
 * @typedef {{
 *   key: string,
 *   vendor: string,
 *   product: string,
 *   unitLabel: string,
 *   unitPriceUsd: number,
 *   retrievedAt: string,
 *   sourceUrl: string,
 *   note: string
 * }} Rate
 */

/** The date every rate below was retrieved. Re-verify before each term. */
export const RATE_SNAPSHOT_DATE = "2026-08-15";

/** @type {Readonly<Record<string, Rate>>} */
export const RATES = Object.freeze({
  objectStorageStandard: {
    key: "objectStorageStandard",
    vendor: "Amazon Web Services",
    product: "S3 Standard, first 50 TB per month, us-east-1",
    unitLabel: "per GB-month",
    unitPriceUsd: 0.023,
    retrievedAt: RATE_SNAPSHOT_DATE,
    sourceUrl: "https://aws.amazon.com/s3/pricing/",
    note: "The default landing tier for a lakehouse. Billed on average bytes stored across the month, not peak.",
  },
  objectStorageInfrequent: {
    key: "objectStorageInfrequent",
    vendor: "Amazon Web Services",
    product: "S3 Standard-Infrequent Access, us-east-1",
    unitLabel: "per GB-month",
    unitPriceUsd: 0.0125,
    retrievedAt: RATE_SNAPSHOT_DATE,
    sourceUrl: "https://aws.amazon.com/s3/pricing/",
    note: "Roughly half the storage rate, but retrieval is charged per GB read. Cheap only if you rarely read it.",
  },
  objectStorageArchive: {
    key: "objectStorageArchive",
    vendor: "Amazon Web Services",
    product: "S3 Glacier Instant Retrieval, us-east-1",
    unitLabel: "per GB-month",
    unitPriceUsd: 0.004,
    retrievedAt: RATE_SNAPSHOT_DATE,
    sourceUrl: "https://aws.amazon.com/s3/pricing/",
    note: "About one sixth of Standard, with a 90-day minimum storage duration and a per-GB retrieval charge.",
  },
  objectStorageDeepArchive: {
    key: "objectStorageDeepArchive",
    vendor: "Amazon Web Services",
    product: "S3 Glacier Deep Archive, us-east-1",
    unitLabel: "per GB-month",
    unitPriceUsd: 0.00099,
    retrievedAt: RATE_SNAPSHOT_DATE,
    sourceUrl: "https://aws.amazon.com/s3/pricing/",
    note: "Around 4 percent of Standard, with a 180-day minimum and retrieval measured in hours, not milliseconds.",
  },
  warehouseStorage: {
    key: "warehouseStorage",
    vendor: "Snowflake",
    product: "On-demand storage, US East",
    unitLabel: "per TB-month",
    unitPriceUsd: 23.0,
    retrievedAt: RATE_SNAPSHOT_DATE,
    sourceUrl: "https://www.snowflake.com/en/data-cloud/pricing-options/",
    note: "Warehouse-managed storage. Compare against $23.55 per TB-month for the same bytes on S3 Standard.",
  },
  putRequests: {
    key: "putRequests",
    vendor: "Amazon Web Services",
    product: "S3 PUT, COPY, POST, LIST requests, us-east-1",
    unitLabel: "per 1,000 requests",
    unitPriceUsd: 0.005,
    retrievedAt: RATE_SNAPSHOT_DATE,
    sourceUrl: "https://aws.amazon.com/s3/pricing/",
    note: "The reason small files are expensive. A million 1 MB files cost 200x the request charge of a thousand 1 GB files.",
  },
  getRequests: {
    key: "getRequests",
    vendor: "Amazon Web Services",
    product: "S3 GET and SELECT requests, us-east-1",
    unitLabel: "per 1,000 requests",
    unitPriceUsd: 0.0004,
    retrievedAt: RATE_SNAPSHOT_DATE,
    sourceUrl: "https://aws.amazon.com/s3/pricing/",
    note: "Each file a query opens is at least one GET. File layout is therefore a cost decision, not only a speed one.",
  },
  computeSingleNode: {
    key: "computeSingleNode",
    vendor: "Amazon Web Services",
    product: "EC2 r5.16xlarge on-demand, 64 vCPU and 512 GiB RAM, us-east-1, Linux",
    unitLabel: "per node-hour",
    unitPriceUsd: 4.032,
    retrievedAt: RATE_SNAPSHOT_DATE,
    sourceUrl: "https://aws.amazon.com/ec2/pricing/on-demand/",
    note: "The single-node ceiling used throughout Week 1. 512 GiB of RAM in one machine, one address space, no network hop.",
  },
  computeWorkerNode: {
    key: "computeWorkerNode",
    vendor: "Amazon Web Services",
    product: "EC2 r5.4xlarge on-demand, 16 vCPU and 128 GiB RAM, us-east-1, Linux",
    unitLabel: "per node-hour",
    unitPriceUsd: 1.008,
    retrievedAt: RATE_SNAPSHOT_DATE,
    sourceUrl: "https://aws.amazon.com/ec2/pricing/on-demand/",
    note: "One worker in a distributed cluster. Exactly one quarter the RAM and one quarter the price of the single node above.",
  },
  scanPerTb: {
    key: "scanPerTb",
    vendor: "Amazon Web Services",
    product: "Athena, SQL over data in S3",
    unitLabel: "per TB scanned",
    unitPriceUsd: 5.0,
    retrievedAt: RATE_SNAPSHOT_DATE,
    sourceUrl: "https://aws.amazon.com/athena/pricing/",
    note: "You pay for bytes the engine reads, not rows returned. Compression and partitioning cut this bill directly.",
  },
  scanPerTib: {
    key: "scanPerTib",
    vendor: "Google Cloud",
    product: "BigQuery on-demand analysis, first 1 TiB per month free",
    unitLabel: "per TiB scanned",
    unitPriceUsd: 6.25,
    retrievedAt: RATE_SNAPSHOT_DATE,
    sourceUrl: "https://cloud.google.com/bigquery/pricing",
    note: "Priced per TiB (1,024^4 bytes), not per TB (1,000^4). The two differ by about 10 percent, which matters at scale.",
  },
  slotHour: {
    key: "slotHour",
    vendor: "Google Cloud",
    product: "BigQuery Standard edition capacity",
    unitLabel: "per slot-hour",
    unitPriceUsd: 0.04,
    retrievedAt: RATE_SNAPSHOT_DATE,
    sourceUrl: "https://cloud.google.com/bigquery/pricing",
    note: "Capacity pricing. You rent parallelism by the hour instead of paying per byte scanned.",
  },
  warehouseCredit: {
    key: "warehouseCredit",
    vendor: "Snowflake",
    product: "Standard edition compute credit, AWS US East",
    unitLabel: "per credit",
    unitPriceUsd: 2.0,
    retrievedAt: RATE_SNAPSHOT_DATE,
    sourceUrl: "https://www.snowflake.com/en/data-cloud/pricing-options/",
    note: "An XS warehouse burns 1 credit per hour; each size up doubles the burn. Enterprise is $3.00 and Business Critical $4.00.",
  },
  databricksJobsDbu: {
    key: "databricksJobsDbu",
    vendor: "Databricks",
    product: "Jobs Compute, Premium tier on AWS",
    unitLabel: "per DBU",
    unitPriceUsd: 0.15,
    retrievedAt: RATE_SNAPSHOT_DATE,
    sourceUrl: "https://www.databricks.com/product/pricing",
    note: "Excludes the underlying EC2 charge, which you also pay. The platform fee is not the whole bill.",
  },
  databricksAllPurposeDbu: {
    key: "databricksAllPurposeDbu",
    vendor: "Databricks",
    product: "All-Purpose Compute, Premium tier on AWS",
    unitLabel: "per DBU",
    unitPriceUsd: 0.55,
    retrievedAt: RATE_SNAPSHOT_DATE,
    sourceUrl: "https://www.databricks.com/product/pricing",
    note: "Interactive notebooks cost about 3.7x the same work run as a scheduled job. Same compute, different SKU.",
  },
  egressInternet: {
    key: "egressInternet",
    vendor: "Amazon Web Services",
    product: "Data transfer out to the internet, beyond the first 100 GB per month",
    unitLabel: "per GB",
    unitPriceUsd: 0.09,
    retrievedAt: RATE_SNAPSHOT_DATE,
    sourceUrl: "https://aws.amazon.com/ec2/pricing/on-demand/",
    note: "Roughly 4x the monthly cost of storing the same byte. Egress is what makes leaving a cloud expensive.",
  },
  egressCrossAz: {
    key: "egressCrossAz",
    vendor: "Amazon Web Services",
    product: "Data transfer between availability zones, each direction",
    unitLabel: "per GB",
    unitPriceUsd: 0.01,
    retrievedAt: RATE_SNAPSHOT_DATE,
    sourceUrl: "https://aws.amazon.com/ec2/pricing/on-demand/",
    note: "The hidden tax on a distributed shuffle. Every byte a worker sends to another worker across a zone is billed twice.",
  },
  catalogObjects: {
    key: "catalogObjects",
    vendor: "Amazon Web Services",
    product: "AWS Glue Data Catalog storage, beyond the first 1,000,000 objects",
    unitLabel: "per 100,000 objects per month",
    unitPriceUsd: 1.0,
    retrievedAt: RATE_SNAPSHOT_DATE,
    sourceUrl: "https://aws.amazon.com/glue/pricing/",
    note: "An object is a table, partition, or database. Partition count, not table count, is what usually blows past the free tier.",
  },
  catalogRequests: {
    key: "catalogRequests",
    vendor: "Amazon Web Services",
    product: "AWS Glue Data Catalog requests, beyond the first 1,000,000 per month",
    unitLabel: "per 1,000,000 requests",
    unitPriceUsd: 1.0,
    retrievedAt: RATE_SNAPSHOT_DATE,
    sourceUrl: "https://aws.amazon.com/glue/pricing/",
    note: "Every query plan hits the catalog several times. Catalog requests scale with query count, not data volume.",
  },
  embeddingTokens: {
    key: "embeddingTokens",
    vendor: "Amazon Web Services",
    product: "Bedrock Titan Text Embeddings V2, on-demand",
    unitLabel: "per 1,000,000 tokens",
    unitPriceUsd: 0.02,
    retrievedAt: RATE_SNAPSHOT_DATE,
    sourceUrl: "https://aws.amazon.com/bedrock/pricing/",
    note: "Charged once per chunk at index time, and again for every chunk you reindex. Reindex frequency is an embedding bill.",
  },
  generationInputTokens: {
    key: "generationInputTokens",
    vendor: "Anthropic",
    product: "Claude Haiku 4.5, input tokens",
    unitLabel: "per 1,000,000 tokens",
    unitPriceUsd: 1.0,
    retrievedAt: RATE_SNAPSHOT_DATE,
    sourceUrl: "https://claude.com/pricing",
    note: "Retrieved chunks are input tokens. A RAG answer that stuffs 20 chunks into context pays for all 20 every time.",
  },
  generationOutputTokens: {
    key: "generationOutputTokens",
    vendor: "Anthropic",
    product: "Claude Haiku 4.5, output tokens",
    unitLabel: "per 1,000,000 tokens",
    unitPriceUsd: 5.0,
    retrievedAt: RATE_SNAPSHOT_DATE,
    sourceUrl: "https://claude.com/pricing",
    note: "Output costs 5x input on this model. Batch processing halves both; prompt caching cuts repeated input by roughly 90 percent.",
  },
});

/**
 * The fully loaded cost of an hour of engineering time.
 *
 * This is NOT a published price and is labelled separately for that reason.
 * It is an organizational assumption covering salary, payroll tax, benefits,
 * equipment, and unbilled time. Salary divided by 2,080 understates it badly.
 */
export const DEFAULT_BLENDED_HOURLY_USD = 140;

/** Bytes in one gibibyte: 1,024 cubed. Not one billion. */
export const BYTES_PER_GIB = 1024 ** 3;

/** Gibibytes in one tebibyte. */
export const GIB_PER_TIB = 1024;

/** Gigabytes (decimal, as vendors bill storage) in one gibibyte. */
export const GB_PER_GIB = (1024 ** 3) / 1000 ** 3;

/** Hours in a 730-hour average month, the figure cloud vendors bill against. */
export const HOURS_PER_MONTH = 730;

/**
 * Look up a rate by key.
 *
 * @param {string} key
 * @returns {Rate}
 */
export function rate(key) {
  const found = RATES[key];
  if (found === undefined) {
    throw new Error(`No published rate is registered under the key "${key}".`);
  }
  return found;
}

/**
 * Cite a rate the way the assumption log should show it: price, unit, vendor,
 * and the date it was retrieved. A price without a date is not evidence.
 *
 * @param {string} key
 * @returns {string}
 */
export function citation(key) {
  const found = rate(key);
  return `$${found.unitPriceUsd} ${found.unitLabel}, ${found.vendor} list price retrieved ${found.retrievedAt}`;
}

/**
 * Every rate as a flat array, for the reference endpoint and the seeder.
 *
 * @returns {Rate[]}
 */
export function allRates() {
  return Object.values(RATES);
}
