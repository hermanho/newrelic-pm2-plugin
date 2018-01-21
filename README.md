# pm2-newrelic-plugin
[![Build Status](https://travis-ci.org/kenahrens/newrelic-pm2-plugin.svg?branch=master)](https://travis-ci.org/kenahrens/newrelic-pm2-plugin)
This plugin will pull data from PM2 and publish to New Relic as a plugin

# Installation instructions
Need to install the dependencies and setup the config
- Run ```pm2 install pm2-newrelic-plugin``` 
- Run ```pm2 config pm2-newrelic-plugin:nrlicense [YOUR NEWRELIC LICENSE KEY]```
- Data should show up under pm2plugin in your New Relic account

![PM2 Dashboard](/images/pm2-plugin-home.jpg)

# History

- 2.1.0 - Renamed to pm2-newrelic-plugin, exposed configuration via the pm2 standard, smart & safer polling interval
- 1.1.0 - Metrics for each PM2 process and added restarts per interval
- 1.0.4 - Close the connection to PM2 on each poll cycle
- 1.0.3 - Fix for when errors are not properly handled from Plugin API
- 1.0.2 - Support for multiple PM2 Servers (run on each PM2 instance)
- 1.0.1 - Support for single PM2 Server only, separate config file
- 1.0.0 - Initial prototype
