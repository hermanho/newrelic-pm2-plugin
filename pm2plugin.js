const pmx = require('pmx');
const pm2 = require('pm2');
const os = require('os');
const request = require('request');

// Version needs to be outside the config file
const ver = require('./package.json').version;
const guid = "com.sealights.pm2plugin";
var duration = 30;
// Running restart 
var restartList = {};

function poll(conf)
{
	// Connect or launch pm2
	pm2.connect(function(err){
		if(err) {
			console.error('Error connecting to pm2', err);
			return;
		}

		// Pull down the list
		pm2.list(function(err, list) {
			// Start an output message
			var msg = {};

			// Create the agent subsection
			var agent = {};
			msg.agent = agent;
			agent.host = os.hostname();
			agent.pid = process.pid;
			agent.version = ver;

			// Create the components array (with only 1 value)
			var components = [];
			msg.components = components;
			components[0] = {};
			components[0].name = os.hostname();
			components[0].guid = guid;
			components[0].duration = duration;

			// Create the metrics subsection
			var metrics = {};
			components[0].metrics = metrics;

			// Process Totals
			var processArr = {};

			// PM2 Totals
			var totalUptime = 0;
			var totalRestarts = 0;
			var totalCpu = 0;
			var totalMemory = 0;
			var totalIntervalRestarts = 0;

			// Pull down data for each function
			list.forEach(function(proc) {

				// Get the metrics
				var processPid = proc.pm_id;
				var processName = proc.pm2_env.name;
				var processUptime = calcUptime(proc.pm2_env.pm_uptime);
				var processTotalRestarts = proc.pm2_env.restart_time;
				var processCpu = proc.monit.cpu;
				var processMemory = proc.monit.memory;

				// Calculate per interval restarts
				var processPreviousRestarts = restartList[processName] || 0;
				var processIntervalRestarts = processTotalRestarts - processPreviousRestarts;
				restartList[processName] = processTotalRestarts;

				// Store the metrics
				var namePrefix = 'Component/id/' + processPid + '/' + processName;
				metrics[namePrefix + '[uptime]'] = processUptime;
				metrics[namePrefix + '[restarts]'] = processTotalRestarts;
				metrics[namePrefix + '[cpu]'] = processCpu;
				metrics[namePrefix + '[memory]'] = processMemory;
				metrics[namePrefix + '[intervalRestarts]'] = processIntervalRestarts;

				// Increment the Process totals
				var currentProcess = processArr[processName];
				if (currentProcess != null) {
					currentProcess.count++;
					currentProcess.uptime += processUptime;
					currentProcess.totalRestarts += processTotalRestarts;
					currentProcess.cpu += processCpu;
					currentProcess.memory += processMemory;
					currentProcess.intervalRestarts += processIntervalRestarts;
					processArr[processName] = currentProcess;
				} else {
					// Initialize the data for this process
					processArr[processName] = {
						'count': 1,
						'uptime': processUptime,
						'totalRestarts': processTotalRestarts,
						'cpu': processCpu,
						'memory': processMemory,
						'intervalRestarts': processIntervalRestarts
					}
				}

				// Increment the PM2 totals
				totalUptime += processUptime;
				totalRestarts += processTotalRestarts;
				totalCpu += processCpu;
				totalMemory += processMemory;
				totalIntervalRestarts += processIntervalRestarts;
			});

			// Create the Process rollup metrics
			for (var processName in processArr) {
				var currentProcess = processArr[processName];
				var namePrefix = 'Component/process/' + processName;
				metrics[namePrefix + '[count]'] = currentProcess.count;
				metrics[namePrefix + '[uptime]'] = currentProcess.uptime;
				metrics[namePrefix + '[restarts]'] = currentProcess.totalRestarts;
				metrics[namePrefix + '[cpu]'] = currentProcess.cpu;
				metrics[namePrefix + '[memory]'] = currentProcess.memory;
				metrics[namePrefix + '[intervalRestarts]'] = currentProcess.intervalRestarts;
			}

			// Create the PM2 rollup metrics
			metrics['Component/rollup/all[uptime]'] = totalUptime;
			metrics['Component/rollup/all[restarts]'] = totalRestarts;
			metrics['Component/rollup/all[cpu]'] = totalCpu;
			metrics['Component/rollup/all[memory]'] = totalMemory;
			metrics['Component/rollup/all[intervalRestarts]'] = totalIntervalRestarts;
	
			// console.log(msg.components[0]);
			var timeStart = new Date().valueOf();
			postToNewRelic(msg, conf, function(){
				// Disconnect from PM2
				pm2.disconnect();
				var timeEnd = new Date().valueOf();
				var submissionTime = (timeEnd-timeStart);
				var wait = (duration*1000) - submissionTime; //Subtract submission time from the desired interval
				if (wait<0) wait = 0;
				// Re-run every duration (30s)
				setTimeout(function() {
					poll(conf);
				}, wait);
			});			
		});
	});
}

function postToNewRelic(msg, conf, callback) {
	if (!conf.nrlicense) { console.log((new Date()).toLocaleString('en-GB') + ' no license, not sending'); return callback(null); }
	var msgString = JSON.stringify(msg);
	// console.log(msg.components[0].metrics);
	request({
		url: "https://metric-api.eu.newrelic.com/metric/v1",
		method: "POST",
		headers: {
			'Content-Type': 'application/json',
			'Accept': 'application/json',
			'Api-Key': conf.nrlicense
		},
		body: msgString
	}, function (err, httpResponse, body) {
		if (!err) {
			console.log((new Date()).toLocaleString('en-GB') + ' New Relic Reponse: %d', httpResponse.statusCode);
			if(body) {
				console.log((new Date()).toLocaleString('en-GB') + ' Response from NR: ' + body);
			}
			callback(null);
		} else {
			console.log((new Date()).toLocaleString('en-GB'));
			console.log('*** ERROR ***');
			console.log(err);
			callback(err);
		}
	});
	// console.log('Just posted to New Relic: %s', msgString);
}

function calcUptime(date) {
	var seconds = Math.floor((new Date() - date) / 1000);
	return seconds;
}

console.log((new Date()).toLocaleString('en-GB') + ' Starting PM2 Plugin version: ' + ver);
pmx.initModule({}, function(err, conf) {
	conf = conf.module_conf;
	if (!conf.nrlicense) {
		console.error((new Date()).toLocaleString('en-GB') + ' nrlicense is not configured. Plugin is disabled');	
	}
	poll(conf);
});
