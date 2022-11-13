const pmx = require('pmx');
const pm2 = require('pm2');
const os = require('os');
const telemetry = require('@newrelic/telemetry-sdk').telemetry;
const { MetricBatch, GaugeMetric, CountMetric, MetricClient } = telemetry.metrics;
const { LogBatch, Log, LogClient } = telemetry.logs;

// Version needs to be outside the config file
const ver = require('./package.json').version;
const duration = 30;
// Running restart
const restartList = {};

/**
 *
 * @param {Date} date
 * @returns
 */
function calcUptime (date) {
  const seconds = Math.floor((new Date() - date) / 1000);
  return seconds;
}

function poll (conf) {
  // Connect or launch pm2
  pm2.connect(function (err) {
    if (err) {
      console.error('Error connecting to pm2', err);
      return;
    }

    // Pull down the list
    pm2.list(function (_err, list) {
      /**
       * Create the metrics subsection
       * @type {telemetry.metrics.Metric[]}
       */
      const metrics = [];

      // PM2 Totals
      let totalUptime = 0;
      let totalRestarts = 0;
      let totalCpu = 0;
      let totalMemory = 0;
      let totalIntervalRestarts = 0;

      // Pull down data for each function
      list.forEach(function (proc) {
        // Get the metric
        const processPid = proc.pm_id;
        const processName = proc.pm2_env.name;
        const processUptime = calcUptime(proc.pm2_env.pm_uptime);
        const processTotalRestarts = proc.pm2_env.restart_time;
        const processCpu = proc.monit.cpu;
        const processMemory = proc.monit.memory;

        // Calculate per interval restarts
        const processPreviousRestarts = restartList[processName] || 0;
        const processIntervalRestarts = processTotalRestarts - processPreviousRestarts;
        restartList[processName] = processTotalRestarts;

        // Store the metric
        const namePrefix = 'Component/id/' + processPid + '/' + processName;
        let metric = new GaugeMetric();
        metrics.push(metric);
        metric.name = namePrefix + '[uptime]';
        metric.value = processUptime;

        metric = new CountMetric();
        metrics.push(metric);
        metric.name = namePrefix + '[restarts]';
        metric.value = processTotalRestarts;

        metric = new GaugeMetric();
        metrics.push(metric);
        metric.name = namePrefix + '[cpu]';
        metric.value = processCpu;

        metric = new GaugeMetric();
        metrics.push(metric);
        metric.name = namePrefix + '[memory]';
        metric.value = processMemory;

        metric = new GaugeMetric();
        metrics.push(metric);
        metric.name = namePrefix + '[intervalRestarts]';
        metric.value = processIntervalRestarts;

        // Increment the PM2 totals
        totalUptime += processUptime;
        totalRestarts += processTotalRestarts;
        totalCpu += processCpu;
        totalMemory += processMemory;
        totalIntervalRestarts += processIntervalRestarts;
      });

      let metric = new GaugeMetric();
      metrics.push(metric);
      metric.name = 'Component/rollup/all[uptime]';
      metric.value = totalUptime;

      metric = new CountMetric();
      metrics.push(metric);
      metric.name = 'Component/rollup/all[restarts]';
      metric.value = totalRestarts;

      metric = new GaugeMetric();
      metrics.push(metric);
      metric.name = 'Component/rollup/all[cpu]';
      metric.value = totalCpu;

      metric = new GaugeMetric();
      metrics.push(metric);
      metric.name = 'Component/rollup/all[memory]';
      metric.value = totalMemory;

      metric = new GaugeMetric();
      metrics.push(metric);
      metric.name = 'Component/rollup/all[intervalRestarts]';
      metric.value = totalIntervalRestarts;

      // console.log(msg.components[0]);
      const timeStart = new Date().valueOf();
      postToNewRelicMetric(metrics, conf, function () {
        // Disconnect from PM2
        pm2.disconnect();
        const timeEnd = new Date().valueOf();
        const submissionTime = (timeEnd - timeStart);
        let wait = (duration * 1000) - submissionTime; // Subtract submission time from the desired interval
        if (wait < 0) wait = 0;
        // Re-run every duration (30s)
        setTimeout(function () {
          poll(conf);
        }, wait);
      });
    });
  });
}

/**
 * @type {telemetry.metrics.MetricClient}
 */
let metricClient;

/**
 * @type {telemetry.logs.LogClient}
 */
let logClient;

/**
 *
 * @param {telemetry.metrics.Metric[]} metrics
 * @param {Function} callback
 * @returns
 */
function postToNewRelicMetric (metrics, conf, callback) {
  if (!conf.nrlicense) { console.log((new Date()).toLocaleString('en-GB') + ' no license, not sending'); return callback(null); }

  const attributes = {};
  attributes.host = os.hostname();
  attributes.pid = process.pid;
  attributes.pluginVersion = ver;
  attributes.osName = os.hostname();

  const batch = new MetricBatch(
    attributes,
    Math.floor(Date.now() / 1000), // timestamp
    1000, // interval -- how offten we're sending this data in milliseconds
    metrics
  );

  metricClient.send(batch, function (err, res, body) {
    if (!err) {
      console.log((new Date()).toLocaleString('en-GB') + ' New Relic Metric Reponse: %d', res.statusCode);
      if (body) {
        console.log((new Date()).toLocaleString('en-GB') + ' Response from NR Metric: ' + body);
      }
      callback && callback(null);
    } else {
      console.log((new Date()).toLocaleString('en-GB'));
      console.log('*** ERROR ***');
      console.log('*** metricClient.send ***');
      console.log(err);
      callback && callback(err);
    }
  });
}

/**
 *
 * @param {'info' | 'error'} logType
 * @param {string} callback
 * @returns
 */
function postToNewRelicLog (logType, message, callback) {
  const attributes = {};
  attributes.host = os.hostname();
  attributes.pid = process.pid;
  attributes.pluginVersion = ver;
  attributes.osName = os.hostname();

  const logMessage = new Log(message, Math.floor(Date.now() / 1000), { logType });
  const batch = new LogBatch([logMessage], attributes);
  logClient.send(batch, function (err, res, body) {
    if (!err) {
      console.log((new Date()).toLocaleString('en-GB') + ' New Relic Metric Log: %d', res.statusCode);
      if (body) {
        console.log((new Date()).toLocaleString('en-GB') + ' Response from NR Log: ' + body);
      }
      callback && callback(null);
    } else {
      console.log((new Date()).toLocaleString('en-GB'));
      console.log('*** ERROR ***');
      console.log('*** logClient.send ***');
      console.log(err);
      callback && callback(err);
    }
  });
}

console.log((new Date()).toLocaleString('en-GB') + ' Starting PM2 Plugin version: ' + ver);
pmx.initModule({}, function (_err, conf) {
  conf = conf.module_conf;
  if (!conf.nrlicense) {
    console.error((new Date()).toLocaleString('en-GB') + ' nrlicense is not configured. Plugin is disabled');
  }
  metricClient = new MetricClient({
    apiKey: conf.nrlicense,
    host: conf.eu ? 'https://metric-api.eu.newrelic.com/metric/v1' : null
  });
  metricClient.addVersionInfo('newrelic-pm2-plugin', ver);
  poll(conf);

  logClient = new LogClient({
    apiKey: conf.nrlicense,
    host: conf.eu ? 'https://metric-api.eu.newrelic.com/metric/v1' : null
  });
  pm2.Client.launchBus(function (err, bus) {
    if (err) return console.error('PM2 Loggly:', err);

    bus.on('log:out', function (log) {
      if (log.process.name !== 'pm2-gelf') {
        postToNewRelicLog('info', log);
      }
    });

    bus.on('log:err', function (log) {
      if (log.process.name !== 'pm2-gelf') {
        postToNewRelicLog('error', log);
      }
    });

    bus.on('reconnect attempt', function () {
      console.log((new Date()).toLocaleString('en-GB') + ' Bus reconnecting');
    });

    bus.on('close', function () {
      console.log((new Date()).toLocaleString('en-GB') + ' Bus closed');
      pm2.disconnectBus();
    });
  });
});
