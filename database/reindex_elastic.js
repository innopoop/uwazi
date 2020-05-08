import { DB } from 'api/odm';
import request from '../app/shared/JSONRequest';
import elasticMapping from './elastic_mapping/elastic_mapping';

import { search } from '../app/api/search';
import { config } from '../app/api/config';
import { IndexError } from '../app/api/search/entitiesIndex';
import { tenants } from '../app/api/tenants/tenantContext';
import errorLog from '../app/api/log/errorLog';

const indexEntities = async () => {
  const spinner = ['|', '/', '-', '\\'];
  let docsIndexed = 0;
  let pos = 0;

  await search.indexEntities({}, '+fullText', 50, indexed => {
    process.stdout.write(
      `Indexing documents and entities... ${spinner[pos]} - ${docsIndexed} indexed\r`
    );
    pos = (pos + 1) % 4;
    docsIndexed += indexed;
  });

  return docsIndexed;
};

const prepareIndex = async indexUrl => {
  process.stdout.write(`Deleting index... ${config.defaultTenant.indexName}\n`);
  try {
    await request.delete(indexUrl);
  } catch (err) {
    // Should not stop on index_not_found_exception
    if (err.json.error.type === 'index_not_found_exception') {
      process.stdout.write('\r\nThe index was not found:\r\n');
      process.stdout.write(`${JSON.stringify(err, null, ' ')}\r\n`);
      process.stdout.write('\r\nMoving on.\r\n');
    } else {
      throw err;
    }
  }

  process.stdout.write(`Creating index... ${config.defaultTenant.indexName}\n`);
  await request.put(indexUrl, elasticMapping);
};

const setReindexSettings = async (
  indexUrl,
  refreshInterval,
  numberOfReplicas,
  translogDurability
) =>
  request.put(`${indexUrl}/_settings`, {
    index: {
      refresh_interval: refreshInterval,
      number_of_replicas: numberOfReplicas,
      translog: {
        durability: translogDurability,
      },
    },
  });

const tweakSettingsForPerformmance = async indexUrl => {
  process.stdout.write('Tweaking index settings for reindex performance...\n');
  return setReindexSettings(indexUrl, -1, 0, 'async');
};

const restoreSettings = async indexUrl => {
  process.stdout.write('Restoring index settings...\n');
  return setReindexSettings(indexUrl, '1s', 1, 'request');
};

const reindex = async () => {
  await tenants.run(async () => {
    const docsIndexed = await indexEntities();
    process.stdout.write(`Indexing documents and entities... - ${docsIndexed} indexed\r\n`);
  });
};

const handleError = async err => {
  if (err instanceof IndexError) {
    process.stdout.write('\r\nWarning! Errors found during reindex.\r\n');
  }
  await DB.disconnect();
  throw err;
};

const done = start => {
  const end = Date.now();
  process.stdout.write(`Done, took ${(end - start) / 1000} seconds\n`);
  errorLog.closeGraylog();
};

DB.connect().then(async () => {
  const start = Date.now();
  const elasticUrl = process.env.ELASTICSEARCH_URL || 'http://localhost:9200';
  const indexUrl = `${elasticUrl}/${config.defaultTenant.indexName}`;

  try {
    await prepareIndex(indexUrl);
    await tweakSettingsForPerformmance(indexUrl);
    await reindex(indexUrl);
    await restoreSettings(indexUrl);
  } catch (err) {
    handleError(err);
  }

  done(start);
  return DB.disconnect();
});
