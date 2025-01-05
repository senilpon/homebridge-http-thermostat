const http = require('http'); // Use the 'http' module for GET requests
const storage = require('node-persist'); // Use 'node-persist' for local storage

class ThermostatAccessory {
	constructor(log, config, api) {
		const Service = api.hap.Service;
		const Characteristic = api.hap.Characteristic;
		this.log = log;
		this.name = config.name || 'Thermostat';
		this.apiGetTemperature = config.apiGetTemperature;
		this.apiSetTemperature = config.apiSetTemperature;
		this.bearerTokenGet = config.apiGetToken;

		this.service = new Service.Thermostat(this.name);

		this.heatingOptions = {
			0: 'Off',
			1: 'Heat',
			//2: 'Cool',
			//3: 'Auto',
		}

		storage.initSync();
		const savedState = storage.getItemSync(`thermostat_${this.name}`) || {};
		this.currentTemperature = savedState.currentTemperature || 20;
		this.targetTemperature = savedState.targetTemperature || 19;
		this.targetHeatingCoolingState = savedState.targetHeatingCoolingState || Characteristic.targetHeatingCoolingState.OFF;

		this.service
			.getCharacteristic(Characteristic.CurrentTemperature)
			.on('get', this.getCurrentTemperature.bind(this));

		this.service
			.getCharacteristic(Characteristic.TargetTemperature)
			.on('get', this.getTargetTemperature.bind(this))
			.on('set', this.setTargetTemperature.bind(this));

		this.service
			.getCharacteristic(Characteristic.targetHeatingCoolingState)
			.on('get', this.getTargetHeatingCoolingState.bind(this))
			.on('set', this.setTargetHeatingCoolingState.bind(this));
	}

	// Fetch current temperature using GET request
	async getCurrentTemperature(callback) {
		const url = new URL(this.apiGetTemperature);
	
		// Define request options for GET request
		const options = {
			hostname: url.hostname,
			path: url.pathname + url.search, // Combine path and query string
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${this.bearerTokenGet}`, // Include the token for authentication
			},
			port: url.port || 80, // Default to port 80 if using HTTP
		};
	
		try {
			// Make the HTTP request using the simplified makeHttpRequest method
			const response = await this.makeHttpRequest(options);
	
			// Log the full response for debugging
			this.log('API Response:', JSON.stringify(response, null, 2));
	
			// Ensure the response contains the 'data' array
			if (response.data && Array.isArray(response.data)) {
				// Find the object where 'name' is 'temp'
				const temperatureData = response.data.find(item => item.name === 'temp');
				
				if (temperatureData) {
					this.currentTemperature = temperatureData.value || 'Unknown'; // Set the temperature value
					this.log(`Fetched current temperature: ${this.currentTemperature}`);
				} else {
					this.currentTemperature = 'Unknown'; // If 'temp' data is not found
					this.log('Temperature data not found');
				}
			} else {
				this.currentTemperature = 'Unknown'; // If 'data' is not in expected format
				this.log('Invalid data format or no data found');
			}
	
			// Call the callback with the temperature
			callback(null, this.currentTemperature);
		} catch (error) {
			// Log and handle the error
			this.log(`Error fetching current temperature: ${error.message}`);
			callback(error);
		}
	}

	// Return target temperature
	getTargetTemperature(callback) {
		this.log(`Returning target temperature: ${this.targetTemperature}`);
		callback(null, this.targetTemperature);
	}

	// Set target temperature (GET request with query string)
	async setTargetTemperature(value, callback) {
		this.targetTemperature = value;
		this.saveState();

		const url = new URL(this.apiSetTemperature);
		url.searchParams.append('temp', value);

		const options = {
			hostname: url.hostname,
			path: url.search, // Combines path and query string
			method: 'GET',
			port: url.port || 80, // Default to port 80 if using HTTP
		};

		try {
			await this.makeHttpRequest(options); // No body is needed for GET
			this.log(`Set target temperature to: ${this.targetTemperature}`);
			callback(null);
		} catch (error) {
			this.log(`Error setting target temperature: ${error.message}`);
			callback(error);
		}
	}

	getTargetHeatingCoolingState(callback) {
		this.log(`Returning target heating/cooling state: ${this.heatingOptions[this.targetHeatingCoolingState]}`);
		callback(null, this.targetHeatingCoolingState);
	}

	setTargetHeatingCoolingState(value, callback) {
		this.targetHeatingCoolingState.targetHeatingCoolingState = value;
		this.saveState();
		callback(null);
	}

	saveState() {
		const state = {
			currentTemperature: this.currentTemperature,
			targetTemperature: this.targetTemperature,
			targetHeatingCoolingState: this.targetHeatingCoolingState
		};
		storage.setitemsync(`thermostat_${this.name}`, state);
		this.log('State saved:', JSON.stringify(state));
	}

	// Simplified version for GET requests only
	makeHttpRequest(options) {
		return new Promise((resolve, reject) => {
			const req = http.request(options, (res) => {
				let responseData = '';
				res.on('data', (chunk) => {
					responseData += chunk;
				});
				res.on('end', () => {
					try {
						// Attempt to parse the response as JSON
						const parsedData = JSON.parse(responseData);
						resolve(parsedData);
					} catch (error) {
						// If parsing fails, resolve with raw response instead
						this.log(`Non-JSON response received: ${responseData}`);
						reject(new Error(`Invalid JSON: ${responseData}`));
					}
				});
			});

			req.on('error', (error) => reject(error)); // Reject the promise on any request error
			req.end(); // End the request (GET requests don't need to send data)
		});
	}

	// Return the service
	getServices() {
		return [this.service];
	}
}

module.exports = ThermostatAccessory;