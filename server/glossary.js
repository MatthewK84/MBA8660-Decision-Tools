/**
 * Every term this application uses, defined.
 *
 * The rule for an entry: a student who has never seen the word should be able
 * to read `plain`, then `precise`, and then use the term correctly in a memo.
 * Where a term has a price attached, `cost` says what it costs and why.
 *
 * Definitions are content, not logic. They are held here rather than in the
 * database so they work in stateless mode and so a change to a definition
 * shows up in a diff.
 *
 * @typedef {{
 *   term: string,
 *   plain: string,
 *   precise: string,
 *   cost: string,
 *   trap: string
 * }} Term
 */

/**
 * Build a term entry.
 *
 * @param {string} term
 * @param {string} plain
 * @param {string} precise
 * @param {string} cost
 * @param {string} trap
 * @returns {Term}
 */
function define(term, plain, precise, cost, trap) {
  return { term, plain, precise, cost, trap };
}

/** @type {Readonly<Record<string, Term>>} */
export const TERMS = Object.freeze({
  "working-set": define(
    "Working set",
    "The slice of data a query actually has to hold in memory at once, which is almost never the whole table.",
    "Rows scanned x bytes per row, after compression, for the columns the query touches. It is a property of the query, not of the table.",
    "The working set decides whether you rent one machine or twenty. It is the single number that moves the compute bill most.",
    "Students size the whole table and conclude they need a cluster. A 4 TB table queried one day at a time has a working set of a few GiB."
  ),
  "distributed-system": define(
    "Distributed system",
    "Several computers that split one job between them and coordinate over a network so it looks like one machine to you.",
    "A cluster where data is partitioned across nodes and a coordinator plans work, ships partitions to workers, and combines partial results.",
    "Distribution does not lower the price of compute. Renting 4 x 128 GiB workers costs the same as 1 x 512 GiB node. You pay extra for coordination, cross-zone network, and idle workers.",
    "Distributed is not a synonym for fast. Below the single-node ceiling a cluster is usually slower, because the network hop and the shuffle cost more than the parallelism saves."
  ),
  "why-distribute": define(
    "Purpose of a distributed system",
    "You distribute when one machine cannot do the job, not when you want the job done faster.",
    "Three conditions justify it: the working set exceeds the largest single machine you can rent; you need more aggregate throughput than one machine's CPU and disk provide; or you need the job to survive one machine dying mid-run.",
    "Each of the three is a different bill. Capacity buys more nodes. Throughput buys bigger nodes. Fault tolerance buys replication, which is a storage multiplier.",
    "If none of the three conditions holds, a distributed system is a cost and complexity increase bought with no benefit. Week 1 exists to make you check."
  ),
  shuffle: define(
    "Shuffle",
    "The step where every worker sends data to every other worker so that rows which belong together end up on the same machine.",
    "The redistribution phase of a distributed join or group-by. Its cost grows with data volume and with worker count, not with the size of the answer.",
    "Shuffle is billed twice on AWS: $0.01 per GB out of a zone and $0.01 per GB in. A 2 TB shuffle across zones costs about $40 in network alone before any compute.",
    "It is the reason adding workers can make a job slower. More workers means more pairs of workers exchanging data."
  ),
  compression: define(
    "Compression",
    "Storing the same information in fewer bytes by not repeating yourself.",
    "An encoding that exploits redundancy. Columnar formats compress well because one column holds one type of value, so values next to each other look alike.",
    "Compression cuts three bills at once: storage per GB-month, bytes scanned per query, and network transfer. At 4x, a $1,000 storage bill becomes $250 and a $5.00 scan becomes $1.25.",
    "The ratio is a measurement, not a constant. High-cardinality identifiers and random strings compress barely at all; low-cardinality codes and timestamps compress enormously."
  ),
  "compression-ratio": define(
    "Compression ratio",
    "How many times smaller the data gets. 4x means a 400 GiB table occupies 100 GiB on disk.",
    "Uncompressed bytes divided by compressed bytes, for a specific dataset under a specific codec. Parquet with ZSTD on typical warehouse data lands between 3x and 10x.",
    "Every unit of ratio is a direct multiplier on the storage bill and on per-TB-scanned query pricing.",
    "Quoting a ratio you did not measure is the most common unexamined assumption in Week 1. Measure it on a sample before you defend it."
  ),
  columnar: define(
    "Columnar storage",
    "Storing a table column by column instead of row by row, so a query that needs 3 of 60 columns reads only those 3.",
    "A layout where values of one column are contiguous on disk, typically in row groups, with per-column statistics that let an engine skip whole blocks. Parquet and ORC are the common formats.",
    "Column pruning and compression together often cut bytes scanned by 10x or more. Under per-TB-scanned pricing that is a 10x cost reduction with no code change.",
    "Columnar is bad at single-row lookups by key. Choosing it for a workload that reads one order at a time is a real mistake."
  ),
  "scan-fraction": define(
    "Scan fraction",
    "The share of a table a typical query has to read. 0.1 means one tenth.",
    "Bytes a representative query reads divided by total table bytes, after partition pruning and predicate pushdown. Expressed here as a decimal from 0.01 to 1.",
    "It multiplies straight into the working set and into per-TB-scanned billing. Halving it halves the compute bill.",
    "A scan fraction near 1 is usually a table-design problem, not a data-size problem. Partitioning and sort order are the fix, not a bigger cluster."
  ),
  partitioning: define(
    "Partitioning",
    "Splitting a table into folders by a column, usually a date, so a query for one day opens one folder.",
    "Physical division of a table by the value of one or more columns, so a predicate on those columns eliminates whole directories before any file is read.",
    "The cheapest cost reduction available. A query filtered to one day of a three-year table reads roughly 1/1,000 of the bytes, and pays roughly 1/1,000 of the scan charge.",
    "Over-partitioning creates millions of tiny files, and the per-request and catalog costs then exceed what you saved. Aim for files of roughly 128 MB to 1 GB."
  ),
  concurrency: define(
    "Peak concurrent queries",
    "How many queries are running at the same instant during your busiest period, not how many run per day.",
    "The maximum number of simultaneously executing queries the system must serve. Each one holds its own working set in memory at the same time.",
    "Memory has to be provisioned for the peak, but you pay for that memory every hour of the month. Concurrency of 14 against a 30 GiB working set means provisioning 420 GiB.",
    "Students confuse concurrency with user count. Thirty analysts who each run a query every ten minutes produce a peak concurrency of about 2, not 30."
  ),
  headroom: define(
    "Headroom",
    "How much room is left before you run out. 2x means you could grow to double the current size and still fit.",
    "Capacity divided by demand. Here, the single-node memory ceiling divided by the projected year-three working set.",
    "Headroom below about 1.5x means you will buy the next size up inside the budget year, so the cheaper architecture was not actually cheaper.",
    "Headroom is a ratio, not a decision. What counts as adequate depends on how fast you can react, and nobody but you can state that."
  ),
  gib: define(
    "GiB versus GB",
    "A GiB is 1,073,741,824 bytes. A GB is 1,000,000,000 bytes. A GiB is about 7 percent larger.",
    "GiB, TiB, and PiB are binary units (powers of 1,024) used for memory. GB, TB, and PB are decimal units (powers of 1,000) used on vendor invoices.",
    "The gap compounds: a TiB is about 10 percent more than a TB. Athena bills per TB while BigQuery bills per TiB, so the same query costs different amounts partly for this reason alone.",
    "Sizing memory in GiB and then pricing storage in GiB understates the bill by about 7 percent. Convert before you multiply by a price."
  ),
  "single-node": define(
    "Single-node ceiling",
    "The biggest one machine you can rent, and therefore the point past which you have no choice but to distribute.",
    "This app assumes 512 GiB of RAM, matching an r5.16xlarge at $4.032 per node-hour. Larger memory-optimized instances exist and cost proportionally more.",
    "$4.032 per hour is about $2,943 per month running continuously, or roughly $353 for an 8-hour business day across a month.",
    "The ceiling is a rental limit, not a law of physics. Naming which instance you mean is part of defending the number."
  ),
  "object-storage": define(
    "Object storage",
    "Where a lakehouse keeps its files. You put a file in, you get a file out, and you pay per GB per month plus a charge per request.",
    "A flat key-value store for immutable blobs (S3, GCS, Azure Blob), with eleven nines of durability, no file-system semantics, and no in-place edits.",
    "$0.023 per GB-month on S3 Standard, so about $23.55 per TB-month and $282 per TB-year. Requests are billed separately at $0.005 per 1,000 writes and $0.0004 per 1,000 reads.",
    "Storage is usually the small half of the bill. Teams optimize the $282 per TB-year and ignore the compute reading it, which is often ten times larger."
  ),
  "storage-tier": define(
    "Storage tier",
    "Cheaper shelves for data you rarely touch, with a penalty for touching it.",
    "Classes trading storage rate against retrieval cost and latency: S3 Standard at $0.023, Standard-IA at $0.0125, Glacier Instant at $0.004, Deep Archive at $0.00099 per GB-month.",
    "Deep Archive is about 4 percent of Standard. Ten years of audit logs at 50 TB costs $13,800 per year on Standard and $594 on Deep Archive.",
    "Minimum storage durations (30, 90, 180 days) and per-GB retrieval charges mean a wrongly tiered object can cost more than leaving it on Standard."
  ),
  egress: define(
    "Egress",
    "What a cloud charges you to take your own data out of it.",
    "Data transfer out to the internet, billed per GB after a small free allowance. Transfer between availability zones is billed separately in both directions.",
    "$0.09 per GB to the internet, which is roughly four times the monthly cost of storing that same byte. Moving 1 PB out costs about $92,000 before anyone rewrites a query.",
    "Egress is the mechanism of cloud lock-in, and it is why a migration estimate that counts only engineering hours is incomplete."
  ),
  "per-tb-scanned": define(
    "Per-TB-scanned pricing",
    "You are billed for the bytes the engine reads off disk, whether the query returns one row or a million.",
    "The serverless query pricing model: Athena at $5.00 per TB, BigQuery on-demand at $6.25 per TiB. Bytes are counted after compression and after partition pruning.",
    "A single unpartitioned SELECT * over a 10 TB table costs $50 on Athena. Run hourly by a dashboard, that is $438,000 a year.",
    "It has no floor and no ceiling, so one careless query is a real invoice. Cost controls belong in the platform, not in a training session."
  ),
  credit: define(
    "Credit",
    "Snowflake's unit of compute. A warehouse burns credits by the second while it is running and none while it is suspended.",
    "An abstract compute-hour unit. An XS warehouse consumes 1 credit per hour, and each size up doubles both throughput and burn rate.",
    "$2.00 per credit on Standard edition, $3.00 on Enterprise, $4.00 on Business Critical. An XL warehouse left running all month costs about $11,680 on Standard.",
    "Auto-suspend settings, not query count, dominate the bill on lightly used warehouses. Idle time is billed if suspend is set too long."
  ),
  dbu: define(
    "DBU",
    "Databricks Unit. Databricks' own charge for processing, billed on top of the cloud machines you also rent.",
    "A normalized unit of processing consumed per hour, varying by instance type and workload class. Jobs Compute is $0.15 per DBU, All-Purpose $0.55, on Premium tier on AWS.",
    "The DBU fee is separate from the EC2 bill for the same cluster. Budgeting one and forgetting the other understates the cost by roughly half.",
    "Running scheduled work on an All-Purpose cluster instead of Jobs Compute costs about 3.7x more for identical work."
  ),
  "slot-hour": define(
    "Slot-hour",
    "Renting a fixed amount of query parallelism by the hour instead of paying per byte read.",
    "A BigQuery slot is a unit of computational capacity. Standard edition capacity is $0.04 per slot-hour, committed or autoscaled.",
    "100 slots running continuously is about $2,920 a month. That is cheaper than on-demand once you scan more than roughly 470 TB a month.",
    "Capacity pricing converts a variable bill into a fixed one. That is a risk transfer, not automatically a saving."
  ),
  "commit-discount": define(
    "Committed-use discount",
    "A lower price in exchange for promising to spend a minimum amount for one to three years.",
    "A contractual commitment: you prepay or guarantee spend, and receive a percentage reduction off list, commonly 10 to 40 percent.",
    "A 20 percent discount on a $432,000 list spend saves $86,400 a year. If usage falls short of the commitment you pay the commitment anyway.",
    "It is a multi-year obligation that follows the workload. If you migrate off the engine in year two, you still owe the remainder."
  ),
  "unit-economics": define(
    "Unit economics",
    "Total cost divided by something the business recognizes, so the number means something to a person who is not on the data team.",
    "Cost per unit of delivered value: dollars per query, per active user, per TB served, per model retrain. The FinOps discipline of denominating spend in business units.",
    "It converts a $1.8 million platform bill into $0.42 per query or $18 per customer per year, which is the form a budget conversation can actually use.",
    "Total spend rising while cost per unit falls is usually success, not failure. Reporting only the total hides that."
  ),
  finops: define(
    "FinOps",
    "The practice of treating cloud spend as an engineering decision with an owner, rather than a bill that arrives.",
    "An operating model pairing engineering, finance, and business on visibility, optimization, and accountability for variable cloud cost.",
    "Its unit of work is a decision that changes a rate or a quantity: reserved capacity, tiering, right-sizing, or turning something off.",
    "Cost cutting is not FinOps. Removing spend without naming what stops working is a decision made in the dark."
  ),
  "table-format": define(
    "Open table format",
    "A specification that turns a pile of Parquet files in object storage into something that behaves like a table, with transactions and schema changes.",
    "A metadata layer over columnar files providing atomic commits, snapshot isolation, time travel, and schema evolution. Iceberg, Delta Lake, and Hudi are the three in wide use.",
    "The format itself is free. The cost is the compaction and metadata maintenance it requires, and the migration cost of changing your mind later.",
    "Choosing an open format does not mean you avoided lock-in. It usually moves the lock-in from the file layer up to the catalog."
  ),
  catalog: define(
    "Catalog",
    "The service that knows which tables exist, where their files are, and who is allowed to read them.",
    "The metadata control plane. It resolves table names to snapshots, serves schemas to query planners, and increasingly issues the storage credentials engines use.",
    "AWS Glue is free to 1,000,000 objects, then $1.00 per 100,000 objects per month, plus $1.00 per million requests past the first million.",
    "It is a single point of failure with an outsized blast radius. If the catalog is down, every engine is down, whether or not the data is fine."
  ),
  "credential-vending": define(
    "Credential vending",
    "The catalog hands out short-lived keys to storage instead of every engine holding its own permanent key.",
    "A pattern where the catalog authorizes a request and returns scoped, time-limited storage credentials, so authorization is enforced in exactly one place.",
    "It removes the cost of reconciling two permission systems, and it adds the cost of the catalog being on the critical path of every read.",
    "It concentrates risk. Compromising the catalog vends credentials to the entire estate at once, so the blast radius is everything."
  ),
  rto: define(
    "RTO",
    "Recovery time objective: how long you have agreed the thing may stay broken.",
    "The maximum tolerable duration of an outage for a given service, stated as a target and owned by a named person.",
    "Every halving of an RTO roughly doubles cost, because it buys automation, redundancy, and staffed on-call rather than best effort.",
    "An RTO with no named owner and no staffing behind it is an aspiration. On a managed catalog, your RTO cannot be shorter than your vendor's."
  ),
  "blast-radius": define(
    "Blast radius",
    "How much breaks when this one thing breaks or is compromised.",
    "The set of systems, datasets, and identities reachable through a single failure or a single stolen credential.",
    "Reducing it costs money: separate credentials, separate accounts, and scoped grants all add operational overhead.",
    "It is measured by what a credential can reach, not by what it is currently used for. An unused grant is still in the blast radius."
  ),
  "break-even": define(
    "Break-even",
    "The month at which the cumulative cost of building equals the cumulative cost of buying.",
    "One-time build cost divided by the monthly saving from building, valid only while the monthly saving stays positive.",
    "If building costs $126,000 up front and saves $4,800 a month, break-even is month 26. Past your evaluation horizon, the horizon decided, not the arithmetic.",
    "The figure rests entirely on the maintenance estimate, which is the number teams underestimate most. Double it and re-read the answer."
  ),
  "blended-rate": define(
    "Blended hourly cost",
    "What an hour of engineering actually costs the organization, not what the engineer is paid.",
    "Fully loaded cost: salary, payroll tax, benefits, equipment, software, management overhead, and unbillable time, divided by productive hours.",
    "Commonly 1.25 to 1.5 times raw salary rate. This app defaults to $140 per hour, which corresponds to roughly a $190,000 fully loaded package.",
    "Salary divided by 2,080 is the wrong number and understates build cost by a third or more."
  ),
  "catch-rate": define(
    "Catch rate",
    "The share of incidents a control would actually have caught, not the share it is designed to catch.",
    "The estimated true-positive rate of a detection control against the real incident population, including the incidents it has no visibility into.",
    "It multiplies straight into avoided exposure. Moving an estimate from 60 to 90 percent changes the business case by half, on no new evidence.",
    "Above about 90 percent is a strong claim. Most post-mortems describe a control that existed and still missed the incident."
  ),
  observability: define(
    "Observability",
    "Being able to tell what the system is doing, and to find out why, without shipping new code.",
    "For data platforms: freshness, volume, schema, distribution, and lineage monitoring, plus the alerting and ownership that acts on them.",
    "Typically 3 to 8 percent of platform spend. It buys down mean time to detect, which is the multiplier on every incident's cost.",
    "It is the first line cut in a budget exercise and the reason the next incident runs long. Cutting it moves cost into the future, it does not remove it."
  ),
  "data-contract": define(
    "Data contract",
    "A written, enforced agreement about the shape and meaning of data crossing a boundary between two teams.",
    "A versioned specification of schema, semantics, quality guarantees, and change policy, checked in CI so a violation fails a pipeline rather than a dashboard.",
    "Costs engineering time to author and enforce. Saves the incident class where an upstream team renames a column on a Tuesday.",
    "A contract nobody can break is documentation. Enforcement in the pipeline is what makes it a contract."
  ),
  "personal-data": define(
    "Personal data",
    "Information that identifies a person, or could when combined with something else.",
    "Definitions differ by statute. US state laws generally cover information linked or reasonably linkable to an identified or identifiable consumer, with carve-outs for de-identified and publicly available data.",
    "It sets the compliance perimeter, and therefore the cost: access controls, retention limits, deletion workflows, and audit evidence all scale with how much data is in scope.",
    "Pseudonymized is not anonymized. If you hold the key, it is still personal data under most of these statutes."
  ),
  "annex-iii": define(
    "Annex III (EU AI Act)",
    "The list of uses the EU treats as high-risk, such as employment screening, credit scoring, and some medical uses.",
    "The annex to Regulation (EU) 2024/1689 enumerating standalone high-risk AI systems. Standalone Annex III obligations apply from 2 December 2027 after the Digital Omnibus deferral.",
    "High-risk classification triggers a risk management system, data governance, technical documentation, logging, human oversight, and conformity assessment. It is a programme, not a control.",
    "Deferred is not cancelled. Time bought is only worth something if you spend it preparing."
  ),
  gpai: define(
    "GPAI",
    "A general-purpose AI model: one trained broadly and adaptable to many tasks, rather than built for one.",
    "Defined in Regulation (EU) 2024/1689. Provider obligations, including technical documentation and copyright policy, have applied since 2 August 2025.",
    "Obligations fall on the provider of the model, not every deployer. Establishing which one you are is the first cost, and it is a legal question.",
    "Fine-tuning a model can make you a provider of a new model. Teams assume they are only deployers and stop asking."
  ),
  "provider-deployer": define(
    "Provider versus deployer",
    "The provider builds or places the AI system on the market. The deployer uses it under its own authority.",
    "Two distinct roles in the EU AI Act carrying different obligations. Substantially modifying a high-risk system, or putting your own name on it, can turn a deployer into a provider.",
    "Provider obligations are far heavier: conformity assessment, technical documentation, and post-market monitoring.",
    "Most organizations are both, for different systems. Answering with one word for the whole company is usually wrong."
  ),
  rag: define(
    "RAG",
    "Retrieval-augmented generation: search your own documents, paste the best passages into the prompt, and have the model answer from them.",
    "A pipeline of chunking, embedding, vector indexing, retrieval, and generation, where retrieved context grounds the model's answer in a controlled corpus.",
    "Two separate bills. Indexing costs embedding tokens once per chunk per reindex. Answering costs input tokens for every retrieved chunk on every question.",
    "Retrieval quality and answer quality are different failures with different owners. An evaluation set that measures only one hides the other."
  ),
  chunk: define(
    "Chunk",
    "A slice of a document, a few hundred words long, that gets embedded and retrieved as a unit.",
    "The atomic unit of a retrieval corpus. Chunk size and overlap trade retrieval precision against the token cost of the context you assemble.",
    "Chunk count, not document count, drives the embedding bill and the per-question input token bill.",
    "A deletion request that removes the source document but leaves its chunks and embeddings has not deleted anything that matters."
  ),
  embedding: define(
    "Embedding",
    "A list of numbers representing a chunk's meaning, so that similar meanings sit near each other and can be found by distance.",
    "A dense vector produced by an embedding model, stored in a vector index and compared by cosine similarity or dot product.",
    "$0.02 per million tokens on Titan Text Embeddings V2. A 400,000-document corpus at roughly 1,000 tokens per document costs about $8 to embed once, and $8 again every reindex.",
    "The embedding is derived personal data if the chunk was. Deleting the chunk and keeping the vector keeps the problem."
  ),
  reindex: define(
    "Reindex",
    "Rebuilding the search index so it reflects what the documents say now rather than what they said last month.",
    "Re-chunking and re-embedding all or part of a corpus, then rebuilding the vector index. The interval sets the maximum staleness of every answer.",
    "Each full pass costs the embedding bill again. Reindexing a 400M-token corpus weekly costs about $416 a year; daily costs about $2,920.",
    "If your deletion SLA is longer than your reindex interval, deleted records stay retrievable until the next pass. The two intervals must be reasoned about together."
  ),
  "workload-identity": define(
    "Workload identity federation",
    "A machine proves what it is to its own platform, and the platform vouches for it, so no long-lived key exists to steal.",
    "An exchange where a workload presents a platform-signed token and receives short-lived credentials for a target system. No static secret is stored anywhere.",
    "Costs integration work up front. Removes the entire class of incidents caused by leaked static keys, along with rotation overhead.",
    "It authenticates the workload, not the request. An agent with a valid identity making a bad decision is still authenticated."
  ),
  "static-key": define(
    "Static API key",
    "A long password for a machine that never expires until somebody notices and revokes it.",
    "A bearer credential with no expiry and no binding to the caller's identity or context. Possession is authorization.",
    "Free to issue, which is why they proliferate. The cost lands entirely in the incident.",
    "Its exposure window is unbounded. An agent's key that leaks produces no error and no complaint, because nothing is failing."
  ),
  "human-in-the-loop": define(
    "Human in the loop",
    "A person has to approve before the machine's action takes effect.",
    "An approval gate on a specified class of action, with a named approver, a decision record, and a defined behavior when nobody responds.",
    "Costs latency and a person's attention on every gated action. That is exactly why teams scope it to writes rather than reads.",
    "A gate everyone approves without reading is theatre that costs latency and buys nothing. Approval rate near 100 percent is the tell."
  ),
  determinism: define(
    "Deterministic",
    "The same inputs always produce the same outputs.",
    "A function with no dependence on the clock, on randomness, on I/O, or on hidden state. Every tool in this application is deterministic by test.",
    "It is what makes a number defensible. If you cannot reproduce the figure in your memo, you cannot defend it in the Live Defense.",
    "A calculation that quietly reads today's date is not deterministic. That is why dates are passed into these tools rather than read from the clock."
  ),
});

/**
 * Look up a term.
 *
 * @param {string} key
 * @returns {Term | undefined}
 */
export function findTerm(key) {
  return TERMS[key];
}

/**
 * Resolve a list of term keys, throwing on any key that has no definition.
 * Called by the catalog so an undefined term fails a test, not a student.
 *
 * @param {readonly string[]} keys
 * @returns {Term[]}
 */
export function resolveTerms(keys) {
  return keys.map((key) => {
    const found = TERMS[key];
    if (found === undefined) {
      throw new Error(`Glossary has no entry for "${key}".`);
    }
    return found;
  });
}

/**
 * Every term, alphabetically by display name.
 *
 * @returns {Term[]}
 */
export function allTerms() {
  return Object.values(TERMS).slice().sort((a, b) => a.term.localeCompare(b.term));
}
