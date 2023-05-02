const puppeteer = require('puppeteer');

async function startBrowser(){
	let browser;
	try {
	    browser = await puppeteer.launch({
	        headless: false,
	        args: ["--disable-setuid-sandbox", "--ignore-certificate-errors", "--ignore-certificate-errors-spki-list", "--disable-web-security",
			"--disable-features=IsolateOrigins,site-per-process"],
	        'ignoreHTTPSErrors': true
	    });
	} catch (err) {
	    console.log("Could not create a browser instance => : ", err);
	}
	return browser;
}

module.exports = {
	startBrowser
};