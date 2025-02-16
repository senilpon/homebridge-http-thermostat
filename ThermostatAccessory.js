const http = require('http'); // Use the 'http' module for GET requests
const storage = require('node-persist'); // Use 'node-persist' for local storage

class ThermostatAccessory {
	constructor(log, config, api) {
		if ( !api || !api.hap) {
			throw new Error('Homebridge API is not initialized. Check your setup.');
		}

		const Service = api.hap.Service;
		const Characteristic = api.hap.Characteristic;
		this.log = log;
		this.name = config.name;
		
		this.apiGetTemperature = config.apiGetTemperature;
		this.apiSetTemperature = config.apiSetTemperature.url;
		this.apiSetTemperatureMethod = config.apiSetTemperature.method || 'POST';
		this.apiSetTemperatureToken = config.apiSetTemperature.token || null;
		
		this.apiSetOFF = config.apiSetOFF.url;
		this.apiSetOFFMethod = config.apiSetOFF.method || 'DELETE';
		this.apiSetOFFToken = config.apiSetOFF.token || null;
	
		this.apiGetToken = config.apiGetToken;
	
		this.targetTemperature = 20;
		this.targetHeatingCoolingState = 1;

		//OFF, HEAT, COOL, AUTO
		this.heatingOptions = {
			0: 'OFF',
			1: 'HEAT'
		}
		this.log('Characteristic.TargetHeatingCoolingState:', Characteristic.TargetHeatingCoolingState);
		this.currentTemperature = 20; // Default value
        this.targetTemperature = 19; // Default value
		this.targetHeatingCoolingState = 0; // Default to 'Off'
        this.temperatureDisplayUnits = 0;

		this.storageInitialized = false;
		this.initStorage();

		this.service = new Service.Thermostat(this.name);

		this.service
			.getCharacteristic(Characteristic.CurrentTemperature)
			.on('get', this.getCurrentTemperature.bind(this));

		this.service
			.getCharacteristic(Characteristic.TargetTemperature)
			.on('get', this.getTargetTemperature.bind(this))
			.on('set', this.setTargetTemperature.bind(this));

		this.service
			.getCharacteristic(Characteristic.TargetHeatingCoolingState)
			.setProps({
				validValues: [
					Characteristic.TargetHeatingCoolingState.OFF,
					Characteristic.TargetHeatingCoolingState.HEAT
				],
			})
			.on('get', this.getTargetHeatingCoolingState.bind(this))
			.on('set', this.setTargetHeatingCoolingState.bind(this));
	}

	async initStorage() {
		try {
			await storage.init();
			this.currentTemperature = (await storage.getItem('currentTemperature')) || 20;
			this.targetTemperature = (await storage.getItem('targetTemperature')) || 19;
			this.targetHeatingCoolingState = (await storage.getItem('targetHeatingCoolingState')) || 0; // Default to 'Off'

			this.storageInitialized = true; // Mark storage as initialized
			this.log(
				`Initialized storage: Current Temp: ${this.currentTemperature}, Target Temp: ${this.targetTemperature}, State: ${this.targetHeatingCoolingState}`
			);
		} catch (error) {
			this.log(`Error initializing storage: ${error.message}`);
		}
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
				'Authorization': `Bearer ${this.apiGetToken}`, // Include the token for authentication
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
		url.searchParams.set('temp', value);
	
		try {
			const response = await this.makeHttpRequest({
				url: url.toString(),
				method: this.apiSetTemperatureMethod, // Uses method from config.json
				token: this.apiSetTemperatureToken  // Uses token from config.json
			});
	
			if (response.error) {
				this.log(`API Error: ${response.error}`);
				throw new Error(response.error);
			}
	
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

	async setTargetHeatingCoolingState(value, callback) {
		this.targetHeatingCoolingState = value;
		this.log(`The new heating/cooling state is ${value}`);
	
		if (value === 0) {
			this.log('Turning off heating/cooling system');
	
			const url = new URL(this.apiSetOFF);
			url.searchParams.set('delay', 5);
	
			try {
				const response = await this.makeHttpRequest({
					url: url.toString(),
					method: this.apiSetOFFMethod, // Uses method from config.json
					token: this.apiSetOFFToken // Uses token from config.json
				});
	
				if (response.error) {
					this.log(`API Error: ${response.error}`);
					throw new Error(response.error);
				}
	
				this.log(`Set heating/cooling to: ${this.targetHeatingCoolingState}`);
				callback(null);
			} catch (error) {
				this.log(`Error setting heating/cooling state: ${error.message}`);
				callback(error);
			}
		}
	
		await this.saveState();
		callback(null);
	}

	// Save state to persistent storage
	async saveState() {
		if (!this.storageInitialized) return;

		await storage.setItem('currentTemperature', this.currentTemperature);
		await storage.setItem('targetTemperature', this.targetTemperature);
		await storage.setItem('targetHeatingCoolingState', this.targetHeatingCoolingState);

		this.log('State saved');
	}

	makeHttpRequest({ url, method = 'GET', token = null }) {
		return new Promise((resolve, reject) => {
			const parsedUrl = new URL(url);
			const headers = {
				'Content-Type': 'application/json',
			};
	
			if (token) {
				headers['Authorization'] = `Bearer ${token}`;
			}
	
			const options = {
				hostname: parsedUrl.hostname,
				path: parsedUrl.pathname + parsedUrl.search,
				method,
				headers,
				port: parsedUrl.port || 80
			};
	
			const req = http.request(options, (res) => {
				let responseData = '';
	
				this.log(`HTTP Status: ${res.statusCode}`);
				this.log(`HTTP Headers: ${JSON.stringify(res.headers)}`);
	
				res.on('data', (chunk) => {
					responseData += chunk;
				});
	
				res.on('end', () => {
					try {
						const parsedData = JSON.parse(responseData);
						resolve(parsedData);
					} catch (error) {
						this.log(`Non-JSON response received: ${responseData}`);
						reject(new Error(`Invalid JSON: ${responseData}`));
					}
				});
			});
	
			req.on('error', (error) => reject(error));
			req.end();
		});
	}

	// Return the service
	getServices() {
		return [this.service];
	}
}

module.exports = ThermostatAccessory;