const http = require('http'); 
const storage = require('node-persist'); 
const querystring = require('querystring'); 

class ThermostatAccessory {
	constructor(log, config, api) {
		if (!api || !api.hap) {
			throw new Error('Homebridge API is not initialized. Check your setup.');
		}
	
		const Service = api.hap.Service;
		const Characteristic = api.hap.Characteristic;
		this.log = log;
		this.name = config.name;
	
		this.apiGetTemperature = config.apiGetTemperature;
		this.apiSetTemperature = config.apiSetTemperature;
	
		this.apiSetOFF = config.apiSetOFF.url;
		this.apiSetOFFMethod = config.apiSetOFF.method || 'POST';
		this.apiSetOFFToken = config.apiSetOFF.token || null;
		this.apiContentType = config.apiContentType || 'application/json';
		this.apiGetToken = config.apiGetToken;
	
		this.targetHeatingCoolingState = 1;
	
		this.heatingOptions = {
			0: 'OFF',
			1: 'HEAT'
		};
		this.log('Characteristic.TargetHeatingCoolingState:', Characteristic.TargetHeatingCoolingState);
		this.currentTemperature = 20; 
		this.targetTemperature = 19;
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

		this.makeHttpRequest = this.makeHttpRequest.bind(this);
	}

	async initStorage() {
		try {
			await storage.init();
			this.currentTemperature = (await storage.getItem('currentTemperature')) || 20;
			this.targetTemperature = (await storage.getItem('targetTemperature')) || 19;
			this.targetHeatingCoolingState = (await storage.getItem('targetHeatingCoolingState')) || 0; 

			this.storageInitialized = true;
			this.log(`Initialized storage: Current Temp: ${this.currentTemperature}, Target Temp: ${this.targetTemperature}, State: ${this.targetHeatingCoolingState}`);
		} catch (error) {
			this.log(`Error initializing storage: ${error.message}`);
		}
	}

    // Fetch current temperature using GET request
	async getCurrentTemperature(callback) {
		if (!this.apiGetTemperature) {
			this.log("Error: apiGetTemperature is not set!");
			return callback(new Error("apiGetTemperature is not defined"));
		}
	
		this.log(`Fetching temperature from: ${this.apiGetTemperature}`);
	
		try {
			const response = await this.makeHttpRequest({
				url: this.apiGetTemperature,
				method: 'GET',
				token: this.apiGetToken,
				contentType: "application/json"
			});
	
			// Log the entire response for debugging
			this.log("API Response:", JSON.stringify(response, null, 2));
	
			// Check if response and response.data are valid
			if (response && response.data && Array.isArray(response.data)) {
				const temperatureData = response.data.find(item => item.name === 'temp');
				if (temperatureData) {
					this.currentTemperature = parseFloat(temperatureData.value) || 0;
					this.log(`Fetched current temperature: ${this.currentTemperature}°C`);
				} else {
					this.currentTemperature = 0;
					this.log("Temperature data not found in response");
				}
			} else {
				this.currentTemperature = 0;
				this.log("Invalid data format or missing data field in API response");
			}
	
			callback(null, this.currentTemperature);
		} catch (error) {
			this.log(`Error fetching current temperature: ${error.message}`);
			callback(error);
		}
	}

	// Return target temperature
	getTargetTemperature(callback) {
		this.log(`Returning target temperature: ${this.targetTemperature}`);
		callback(null, this.targetTemperature);
	}

	// Set target temperature (POST request)
	async setTargetTemperature(value, callback) {
		if (!this.apiSetTemperature || !this.apiSetTemperature.url) {
			this.log("Error: apiSetTemperature URL is not set!");
			return callback(new Error("apiSetTemperature is not defined"));
		}
	
		const url = this.apiSetTemperature.url;
		const token = this.apiSetTemperature.token;
	
		// Check the content type and prepare the body accordingly
		let postData = null;
	
		if (this.apiContentType === 'application/x-www-form-urlencoded') {
			// URL-encode the body for x-www-form-urlencoded content type
			postData = querystring.stringify({ temp: value });
		} else if (this.apiContentType === 'application/json') {
			// JSON encode the body for application/json content type
			postData = JSON.stringify({ temp: value });
		} else {
			// Handle other content types here if needed
		}
	
		this.log(`Setting temperature to ${value}°C at ${url} with token: ${token}`);
		this.log(`Request Body: ${postData}`);
	
		try {
			const response = await this.makeHttpRequest({
				url: url,
				method: 'POST',
				token: token,
				body: postData,
				contentType: this.apiContentType // Set content type here
			});
	
			this.log(`Temperature set response: ${JSON.stringify(response, null, 2)}`);
	
			if (response && response.status === "success") {
				this.log("Temperature successfully updated!");
				this.targetTemperature = value;
			} else {
				this.log("Warning: API did not confirm temperature change.");
			}
	
			callback(null);
		} catch (error) {
			this.log(`Error setting temperature: ${error.message}`);
			callback(error);
		}
	
		await this.saveState();
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
		
			// Prepare the request body based on the content type
			let postData = null;
	
			if (this.apiContentType === 'application/x-www-form-urlencoded') {
				// URL-encode the body for x-www-form-urlencoded content type
				postData = querystring.stringify({ delay: 5 });
			} else if (this.apiContentType === 'application/json') {
				// JSON encode the body for application/json content type
				postData = JSON.stringify({ delay: 5 });
			} else {
				// Handle other content types here if needed
			}
	
			try {
				// Make the HTTP request with the appropriate body and content type
				const response = await this.makeHttpRequest({
					url: url.toString(),
					method: this.apiSetOFFMethod,
					token: this.apiSetOFFToken,
					body: postData,
					contentType: this.apiContentType
				});
	
				// Check if the response is valid JSON and contains an error
				try {
					const parsedResponse = JSON.parse(response); // Try to parse it as JSON
					if (parsedResponse.error) {
						this.log(`API Error: ${parsedResponse.error}`);
						throw new Error(parsedResponse.error);
					}
	
					this.log(`Set heating/cooling to: ${this.targetHeatingCoolingState}`);
					callback(null);
	
				} catch (parseError) {
					// If parsing fails, log raw response data
					this.log(`Received raw response: ${response}`);
					throw new Error('Invalid JSON response from API');
				}
	
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

	makeHttpRequest({ url, method = 'GET', token = null, body = null, contentType = 'application/json' }) {
		return new Promise((resolve, reject) => {
			const parsedUrl = new URL(url);
	
			// Handle body encoding only for non-GET requests
			if (method !== 'GET' && contentType === 'application/x-www-form-urlencoded' && typeof body === 'object') {
				body = querystring.stringify(body);  // URL-encode the body
			} else if (method !== 'GET' && contentType === 'application/json' && typeof body === 'object') {
				body = JSON.stringify(body);  // JSON encode the body
			}
	
			// Set headers dynamically
			const headers = {
				'Content-Type': contentType,
			};
	
			if (token) {
				headers['Authorization'] = `Bearer ${token}`;
			}
	
			if (body) {
				headers['Content-Length'] = Buffer.byteLength(body);
			}
	
			const options = {
				hostname: parsedUrl.hostname,
				path: parsedUrl.pathname + parsedUrl.search, // Ensure query params are part of the path
				method,
				headers,
				port: parsedUrl.port || 80,
			};
	
			const req = http.request(options, (res) => {
				let responseData = '';
	
				res.on('data', (chunk) => {
					responseData += chunk;
				});
	
				res.on('end', () => {
					this.log("Raw response data:", responseData);
					try {
						if (responseData) {
							const parsedResponse = JSON.parse(responseData);
							this.log("Parsed response:", JSON.stringify(parsedResponse, null, 2));
							resolve(parsedResponse);
						} else {
							reject(new Error("No response data received"));
						}
					} catch (error) {
						this.log(`Error parsing response: ${error.message}`);
						reject(new Error(`Invalid JSON response: ${responseData}`));
					}
				});
			});
	
			req.on('error', (error) => {
				this.log(`Request error: ${error.message}`);
				reject(error);
			});
	
			// For non-GET methods, or if body is present for non-GET, write the body
			if (method !== 'GET' && body) {
				this.log("Request Body: ", body);  // Log body before sending
				req.write(body);
			}
	
			req.end();
		});
	}

	// Return the service
	getServices() {
		return [this.service];
	}
}

module.exports = ThermostatAccessory;