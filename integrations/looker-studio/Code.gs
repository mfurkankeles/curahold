// Curahold's Looker Studio community connector.
//
// It reads the analytics feed's JSON face (api/src/routes/analytics.ts) with an
// analytics key: the person connecting gives their company's address and the key
// (Looker Studio's PATH_KEY sign-in), picks one dataset, and Looker Studio gets
// typed fields. Read only; the key sees what its owner sees in Curahold.
// Deploying it is described in README.md next to this file.

var cc = DataStudioApp.createCommunityConnector();
var MAX_ROWS = 200000; // Apps Script runs at most six minutes; a bigger set is narrowed with "since".

// ---------------------------------------------------------------- sign-in

function getAuthType() {
  return cc.newAuthTypeResponse().setAuthType(cc.AuthType.PATH_KEY).setHelpUrl('https://curahold.com/docs/en/bi-tools/#looker-studio').build();
}

function props_() {
  return PropertiesService.getUserProperties();
}

/** "acme.curahold.com", "https://acme.curahold.com/" or a self-hosted address, as https://host. */
function baseOf_(path) {
  var s = String(path || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
  return s.replace(/\/api\/analytics.*$/, '');
}

function call_(url, key) {
  return UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + key, Accept: 'application/json' },
    muteHttpExceptions: true,
    followRedirects: false,
  });
}

function setCredentials(request) {
  var base = baseOf_(request.pathKey.path);
  var key = String(request.pathKey.key || '').trim();
  var res = call_(base + '/api/analytics/v1/', key);
  if (res.getResponseCode() !== 200) return cc.newSetCredentialsResponse().setIsValid(false).build();
  props_().setProperty('curahold.base', base);
  props_().setProperty('curahold.key', key);
  return cc.newSetCredentialsResponse().setIsValid(true).build();
}

function isAuthValid() {
  var base = props_().getProperty('curahold.base');
  var key = props_().getProperty('curahold.key');
  if (!base || !key) return false;
  return call_(base + '/api/analytics/v1/', key).getResponseCode() === 200;
}

function resetAuth() {
  props_().deleteProperty('curahold.base');
  props_().deleteProperty('curahold.key');
}

function isAdminUser() {
  return false;
}

// ---------------------------------------------------------------- the datasets

function catalog_() {
  var base = props_().getProperty('curahold.base');
  var key = props_().getProperty('curahold.key');
  var res = call_(base + '/api/analytics/v1/', key);
  if (res.getResponseCode() !== 200) fail_(res);
  return JSON.parse(res.getContentText()).datasets;
}

function fail_(res) {
  var msg = 'Curahold answered ' + res.getResponseCode();
  try {
    msg = JSON.parse(res.getContentText()).message || msg;
  } catch (e) {
    /* not JSON */
  }
  cc.newUserError().setText(msg).setDebugText(res.getContentText().slice(0, 500)).throwException();
}

function getConfig() {
  var config = cc.getConfig();
  var pick = config.newSelectSingle().setId('dataset').setName('Dataset').setHelpText('One table from Curahold. Join tables on their Id columns in a blend.');
  catalog_().forEach(function (d) {
    pick.addOption(config.newOptionBuilder().setLabel(d.name + ' — ' + d.about).setValue(d.name));
  });
  config.newTextInput().setId('since').setName('Changed since (optional)').setHelpText('A date such as 2026-01-01: only rows changed on or after it.').setAllowOverride(true);
  config.setIsSteppedConfig(false);
  return config.build();
}

function columnsOf_(name) {
  var set = catalog_().filter(function (d) {
    return d.name === name;
  })[0];
  if (!set) cc.newUserError().setText('This key cannot read ' + name + ' any more.').throwException();
  return set.columns;
}

function fieldsOf_(columns) {
  var fields = cc.getFields();
  var T = cc.FieldType;
  columns.forEach(function (c) {
    var f;
    if (c.type === 'Int32' || c.type === 'Double' || c.type === 'Decimal') f = fields.newMetric().setType(T.NUMBER);
    else if (c.type === 'Boolean') f = fields.newDimension().setType(T.BOOLEAN);
    else if (c.type === 'Date') f = fields.newDimension().setType(T.YEAR_MONTH_DAY);
    else if (c.type === 'DateTimeOffset') f = fields.newDimension().setType(T.YEAR_MONTH_DAY_SECOND);
    else f = fields.newDimension().setType(T.TEXT);
    f.setId(c.name).setName(c.name);
  });
  return fields;
}

function getSchema(request) {
  if (!request.configParams || !request.configParams.dataset) cc.newUserError().setText('Choose a dataset.').throwException();
  return { schema: fieldsOf_(columnsOf_(request.configParams.dataset)).build() };
}

// ---------------------------------------------------------------- the rows

/** A value as Looker Studio wants it: days as YYYYMMDD, times as YYYYMMDDHHMMSS (UTC). */
function cell_(type, v) {
  if (v === null || v === undefined) return type === 'Int32' || type === 'Double' || type === 'Decimal' ? null : '';
  if (type === 'Date') return String(v).slice(0, 10).replace(/-/g, '');
  if (type === 'DateTimeOffset') return String(v).replace(/[-:T]/g, '').slice(0, 14);
  return v;
}

function getData(request) {
  var name = request.configParams.dataset;
  var columns = columnsOf_(name);
  var wanted = request.fields.map(function (f) {
    return f.name;
  });
  var types = {};
  columns.forEach(function (c) {
    types[c.name] = c.type;
  });
  var base = props_().getProperty('curahold.base');
  var key = props_().getProperty('curahold.key');
  var url = base + '/api/analytics/v1/' + encodeURIComponent(name) + '.json?limit=5000&fields=' + encodeURIComponent(wanted.join(','));
  var since = (request.configParams.since || '').trim();
  if (since) url += '&since=' + encodeURIComponent(since);
  var rows = [];
  var waits = 0;
  while (url && rows.length < MAX_ROWS) {
    var res = call_(url, key);
    // Too fast: wait as long as Curahold asks, a few times; a used-up daily budget is reported instead.
    if (res.getResponseCode() === 429 && waits < 5) {
      var after = Number(res.getHeaders()['Retry-After'] || res.getHeaders()['retry-after'] || 2);
      if (after <= 10) {
        waits++;
        Utilities.sleep(after * 1000);
        continue;
      }
    }
    if (res.getResponseCode() !== 200) fail_(res);
    var page = JSON.parse(res.getContentText());
    page.rows.forEach(function (r) {
      rows.push({
        values: wanted.map(function (n) {
          return cell_(types[n], r[n]);
        }),
      });
    });
    url = page.next;
  }
  return {
    schema: fieldsOf_(
      columns.filter(function (c) {
        return wanted.indexOf(c.name) >= 0;
      }),
    )
      .build()
      .sort(function (a, b) {
        return wanted.indexOf(a.name) - wanted.indexOf(b.name);
      }),
    rows: rows,
  };
}
