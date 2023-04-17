
const fs = require("fs").promises;
const path = require("path");
const process = require("process");
const { authenticate } = require("@google-cloud/local-auth");
const { google } = require("googleapis");

let documentCopyId;
var indexToSplit;

const SCOPES = [
  "https://www.googleapis.com/auth/drive.metadata.readonly",
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/drive.file",
];

const TOKEN_PATH = path.join(process.cwd(), "token.json");
const CREDENTIALS_PATH = path.join(process.cwd(), "creds.json");

const scraperObject = {
  url: "https://tabs.ultimate-guitar.com/tab/acdc/you-shook-me-all-night-long-chords-621851",
  async scraper(browser) {
    let page = await browser.newPage();
    console.log(`Navigating to ${this.url}...`);
    await page.goto(this.url);
    await page.waitForSelector(".P8ReX");

    let first;
    let second;
    let third;
    let newTitle;
    let string1;
    let string2;

    setTimeout(async () => {
      first = await page.$$eval("pre > span", (options) => {
        return options.map((option) => option.textContent);
      });
      second = await page.$$eval("header > h1", (options) => {
        return options.map((option) => option.textContent);
      });
      third = await page.$$eval("header > span > a", (options) => {
        return options.map((option) => option.textContent);
      });

      second = second.join("");
      third = third.join("");
      second = second.replace(" Chords", "");
      third = third.replace("Edit", "");
      newTitle = second + " - " + third;

      first = first.join("");
      first = first.replaceAll("[Chorus]", "Chorus");
      first = first.replaceAll("[Intro]", "Intro");
      first = first.replaceAll("[Pre-chorus]", "Pre-chorus");
      first = first.replaceAll("[Verse]", "Verse");
      first = first.replaceAll("[Verse 1]", "Verse 1");
      first = first.replaceAll("[Verse 2]", "Verse 2");
      first = first.replaceAll("[Interlude]", "Interlude");
      first = first.replaceAll("[Bridge]", "Bridge");
      first = first.replaceAll("[Intro Tab]", "Intro Tab");
      first = first.replaceAll("[Instrumental]", "Instrumental");
      first = first.replaceAll("[Outro]", "Outro");

      let chartArr = first.split(/\r\n|\r|\n/);
      let newArr = chartArr.slice(0, 49);

      for (var i = 49; i > 34; i--) {
        if (newArr[i] === " ") {
          indexToSplit = i;
          break;
        } else {
          console.log("this is a line: " + i);
        }
      }

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
          type: "authorized_user",
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
        const drive = google.drive({ version: "v3", auth: authClient });
        const docs = google.docs({ version: "v1", auth: authClient });

        const titles =
          /(Chorus|Bridge|Outro|Intro|Verse|Verse 1|Verse 2|Verse 3|Instrumental|Interlude|Bridge|Intro Tab|Pre-chorus)/gi;
        const chords =
          /^[A-G][#b]?(m|maj|dim|aug|sus)?\d?(\/[A-G][#b]?)?(\s+[A-G][#b]?(m|maj|dim|aug|sus)?\d?(\/[A-G][#b]?)?)*$/;
        var indexCount = 4;
        const requests = [
          {
            replaceAllText: {
              replaceText: newTitle,
              containsText: {
                text: "Song Title - Artist Name",
                matchCase: true,
              },
            },
          },
        ];

        first.split(/\n/).forEach((line, index) => {
          const isTitle = titles.test(line);
          const isChord = chords.test(line.trim());
          if (Number(index) <= Number(indexToSplit)) {
            if (!isTitle && !isChord) {
              requests.push({
                insertText: {
                  text: line,
                  location: {
                    index: indexCount + 1,
                  },
                },
              });
              requests.push({
                updateTextStyle: {
                  range: {
                    startIndex: indexCount + 1,
                    endIndex: indexCount + line.length,
                  },
                  textStyle: {
                    bold: false,
                  },
                  fields: "bold",
                },
              });
              indexCount = indexCount + line.length;
            } else {
              requests.push({
                insertText: {
                  text: line,
                  location: {
                    index: indexCount + 1,
                  },
                },
              });
              requests.push({
                updateTextStyle: {
                  range: {
                    startIndex: indexCount + 1,
                    endIndex: indexCount + line.length,
                  },
                  textStyle: {
                    bold: true,
                  },
                  fields: "bold",
                },
              });
              indexCount = indexCount + line.length;
            }
          }
        });

        let chartArr = first.split(/\n/);
        let colChart2 = chartArr.slice(indexToSplit + 1, chartArr.length);
        let toWrite = colChart2.join("\r\n");
        requests.push({
          replaceAllText: {
            replaceText: toWrite,
            containsText: {
              text: "col2",
              matchCase: true,
            },
          },
        });

        console.log(JSON.stringify(requests));
        await drive.files.copy(
          {
            fileId: "1xM26IwbTj7L9VNXwDLyXV4ZWSdLUvRybDclq_u46My4",
            resource: { name: newTitle },
          },
          async (err, driveResponse) => {
            documentCopyId = driveResponse.data.id;
            console.log(driveResponse.data.id);
            const updateResponse = await docs.documents.batchUpdate({
              documentId: documentCopyId,
              requestBody: {
                requests: requests,
              },
            });
            console.log(updateResponse.data);
          }
        );
      }
      authorize().then(listFiles).catch(console.error);
    }, 100);
  },
};

module.exports = scraperObject;
