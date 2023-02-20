const songJSON = require('./songTemplate.json');
let songToSend = songJSON;
const fs = require('fs').promises;
const path = require('path');
const process = require('process');
const {authenticate} = require('@google-cloud/local-auth');
const {google} = require('googleapis');

		
let documentCopyId;
		// If modifying these scopes, delete token.json.
		const SCOPES = ['https://www.googleapis.com/auth/drive.metadata.readonly',
						'https://www.googleapis.com/auth/documents', 
						'https://www.googleapis.com/auth/drive', 
						'https://www.googleapis.com/auth/drive.file'];
		// The file token.json stores the user's access and refresh tokens, and is
		// created automatically when the authorization flow completes for the first
		// time.
		const TOKEN_PATH = path.join(process.cwd(), 'token.json');
		const CREDENTIALS_PATH = path.join(process.cwd(), 'creds.json');

const scraperObject = {
    url: 'https://tabs.ultimate-guitar.com/tab/vance-joy/riptide-chords-1237247',
    async scraper(browser){
        let page = await browser.newPage();
		console.log(`Navigating to ${this.url}...`);
		// Navigate to the selected page
		await page.goto(this.url);
		// Wait for the required DOM to be rendered
		await page.waitForSelector('.P8ReX');
		// Get the text from song chord chart
		let first = await page.$$eval('pre > span', options => {
			return options.map(option => option.textContent);
		});
		
		first =first.join('')
first=first.replace('[Chorus]', 'Chorus')
first=first.replace('[Chorus]', 'Chorus')
first=first.replace('[Intro]', 'Intro')
first=first.replace('[Pre-chorus]', 'Pre-chorus')
first=first.replace('[Pre-chorus]', 'Pre-chorus')
first=first.replace('[Pre-chorus]', 'Pre-chorus')
first=first.replace('[Verse 1]', 'Verse 1')
first=first.replace('[Verse 2]', 'Verse 2')
first=first.replace('[Interlude]', 'Interlude')
first=first.replace('[Bridge]', 'Bridge')
first=first.replace('[Chorus]', 'Chorus')
		

		/**
		 * Reads previously authorized credentials from the save file.
		 *
		 * @return {Promise<OAuth2Client|null>}
		 */
		async function loadSavedCredentialsIfExist() {
		  try {
			const content = await fs.readFile(TOKEN_PATH);
			const credentials = JSON.parse(content);
			return google.auth.fromJSON(credentials);
		  } catch (err) {
			return null;
		  }
		}
		
		/**
		 * Serializes credentials to a file comptible with GoogleAUth.fromJSON.
		 *
		 * @param {OAuth2Client} client
		 * @return {Promise<void>}
		 */
		async function saveCredentials(client) {
		  const content = await fs.readFile(CREDENTIALS_PATH);
		  const keys = JSON.parse(content);
		  const key = keys.installed || keys.web;
		  const payload = JSON.stringify({
			type: 'authorized_user',
			client_id: key.client_id,
			client_secret: key.client_secret,
			refresh_token: client.credentials.refresh_token,
		  });
		  await fs.writeFile(TOKEN_PATH, payload);
		}
		
		/**
		 * Load or request or authorization to call APIs.
		 *
		 */
		async function authorize() {
		  let client = await loadSavedCredentialsIfExist();
		  if (client) {
			return client;
		  }
		  client = await authenticate({
			scopes: SCOPES,
			keyfilePath: CREDENTIALS_PATH,
		  });
		  if (client.credentials) {
			await saveCredentials(client);
		  }
		  return client;
		}
		
		/**
		 * Lists the names and IDs of up to 10 files.
		 * @param {OAuth2Client} authClient An authorized OAuth2 client.
		 */
		async function listFiles(authClient) {
		  const drive = google.drive({version: 'v3', auth: authClient});
		  const docs = google.docs({version: 'v1', auth: authClient});
		  
			var copyTitle = "Song Template for Scraping";
		let request = {
		  name: copyTitle,
			};
			await drive.files.copy({
		  fileId: '1-UZ-ABRd9w-YyarPdb7hPu2DqGiF1lrAyIRf3thoulQ',
		  resource: request,
		}, async(err, driveResponse) => {
		  documentCopyId = driveResponse.data.id;
		  console.log(driveResponse.data.id)
		  const updateResponse = await docs.documents.batchUpdate({
			documentId: documentCopyId,
			requestBody: {
			  requests: [
				{
				insertText: {
				   location: {
						index: 28,
						},
						text: first
					}
			  }
			]
			}
		  });
		  console.log(updateResponse.data);
		  return updateResponse.data;
		});
		
		}
		
		authorize().then(listFiles).catch(console.error);
    }
}

module.exports = scraperObject;