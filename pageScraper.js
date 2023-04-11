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
    url: 'https://tabs.ultimate-guitar.com/tab/bruno-mars/when-i-was-your-man-chords-1198871',
    async scraper(browser){
        let page = await browser.newPage();
		console.log(`Navigating to ${this.url}...`);
		// Navigate to the selected page
		await page.goto(this.url);
		// Wait for the required DOM to be rendered
		await page.waitForSelector('.P8ReX');

		let capo = await page.$$eval("table > tr:nth-child(4) > td > span", options =>{
			return options.map(option => option.textContent);
		})
		
		//click -1 
		// await page.click("section > div:nth-child(7) > div > span.NWgb3 > button:nth-child(1)")
			
		capo = Number(capo.join('').charAt(0))
		console.log(capo)

		for(var i=0;i<capo;i++){
			// click +1
			await page.click("section > div:nth-child(7) > div > span.NWgb3 > button:nth-child(3)")
		}
		 
		console.log(capo)

		let first;
		let second;
		let third;
		let newTitle;
		let middle;
		let before;
		let after;
		let string1;
		let string2;
		// Get the text from song chord chart
		setTimeout( async() => {
			first = await page.$$eval('pre > span', options => {
				return options.map(option => option.textContent);
			});
	
			second = await page.$$eval('header > h1', options => {
				return options.map(option => option.textContent);
			});
			third = await page.$$eval('header > span > a', options => {
				return options.map(option => option.textContent);
			});

		second = second.join('')
		third = third.join('')
		second=second.replace(' Chords', '')
		third=third.replace('Edit', '')
		newTitle = second + ' - ' + third
		// console.log(second)
		// console.log(third)
		// console.log(newTitle)
		
		first=first.join('')
first=first.replaceAll('[Chorus]', 'Chorus')
first=first.replaceAll('[Intro]', 'Intro')
first=first.replaceAll('[Pre-chorus]', 'Pre-chorus')
first=first.replaceAll('[Verse]', 'Verse')
first=first.replaceAll('[Verse 1]', 'Verse 1')
first=first.replaceAll('[Verse 2]', 'Verse 2')
first=first.replaceAll('[Interlude]', 'Interlude')
first=first.replaceAll('[Bridge]', 'Bridge')
first=first.replaceAll('[Intro Tab]', 'Intro Tab')
first=first.replaceAll('[Instrumental]', 'Instrumental')
first=first.replaceAll('[Outro]', 'Outro')

middle = Math.floor(first.length / 2);
before = first.lastIndexOf(' ', middle);
after = first.indexOf(' ', middle + 1);

if (middle - before < after - middle) {
    middle = before;
} else {
    middle = after;
}

string1 = first.substr(0, middle);
console.log(string1)
string2 = first.substr(middle + 1);

// Sort string1 and string2 into requests
// With bold and unbold based on regex patterns
// Insert starting at specified section title
// Read index location/range from last request 
// Insert next request afer last request end

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

const titles = /(Chorus|Bridge|Outro|Intro|Verse|Verse 1|Verse 2|Verse 3|Instrumental|Interlude|Bridge|Intro Tab|Pre-chorus)/gi;
const chords = /^[A-G][#b]?(m|maj|dim|aug|sus)?\d?(\/[A-G][#b]?)?(\s+[A-G][#b]?(m|maj|dim|aug|sus)?\d?(\/[A-G][#b]?)?)*$/;
var indexCount = 4;		  
const requests = [{ 
	replaceAllText: {
		replaceText: newTitle,
		containsText: {
			text: 'Song Title - Artist Name',
			matchCase: true
		}
	}
}];
		  string1.split("\n").forEach((line) => {
			const isTitle = titles.test(line);
			const isChord = chords.test(line.trim());
      
			if (!isTitle && !isChord) {
			  requests.push({
      insertText: {
        text: line,
        location: {
          index: indexCount + 1
        }
      }
    });
     requests.push({
      updateTextStyle: {
        range: {
          startIndex: indexCount + 1,
          endIndex: indexCount + line.length
        },
        textStyle: {
          bold: false
        },
        fields: "bold"
      }
		});
         indexCount = indexCount + line.length
			} else {
          requests.push({
				insertText: {
        text: line,
        location: {
          index: indexCount + 1
        }
      }
			  });
         requests.push({
      updateTextStyle: {
        range: {
          startIndex: indexCount + 1,
          endIndex: indexCount + line.length
        },
        textStyle: {
          bold: true
        },
        fields: "bold"
      }
		});
       indexCount = indexCount + line.length 
        } 
		  });
		  
		await drive.files.copy({
		  fileId: '1xM26IwbTj7L9VNXwDLyXV4ZWSdLUvRybDclq_u46My4',
		  resource: {name: newTitle},
		}, async(err, driveResponse) => {
		  documentCopyId = driveResponse.data.id;
		  console.log(driveResponse.data.id)
		  const updateResponse = await docs.documents.batchUpdate({
			documentId: documentCopyId,
			requestBody: {
			  requests: requests
			}
		  });
		  console.log(updateResponse.data);
		});
		}
		authorize().then(listFiles).catch(console.error);
	}, 100);

	}
}



module.exports = scraperObject;