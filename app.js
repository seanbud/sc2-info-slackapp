var rp = require('request-promise');
var fuzzysearch = require('fuzzy-search');
var cheerio = require('cheerio');
var express = require('express');

var app = express();
app.use(express.json()); // To support JSON-encoded bodies

app.post('/map', function (req, res) {
	// Get the data argument sent in the post. 
	var data_arg = req.body.text;
	console.log('POST request to /map, with data: \"' + data_arg + '\"\n');

	// Request a list of pages with Category:Maps from Liquipedia. Reutrn a list of objects, [{ pageid, title }...]
	rp({
		method: 'GET',
		uri: 'https://liquipedia.net/starcraft2/api.php?action=query&format=json&list=categorymembers&cmtitle=Category%3AMaps&cmlimit=max',
		gzip: true,
		headers: {
			'User-Agent': 'Sc2 Info SlackBot/v1.0 (https://github.com/seanbud/sc2-info-slackapp/; sbudning@gmail.com)'
		},
		
		// parse, filter, and map the data into an array of page objects
		transform: function (body, response, resolveWithFullResponse) {
			return JSON.parse(body).query.categorymembers
						.filter(function(page) { return page.ns == '0'; })
						.map(page => ({ pageid: page.pageid, title: page.title}));
		}
	})

    .then(function (page_list) {
    	// Report number of pages found
		console.log(page_list.length + ' map pages found.');

		// Fuzzy-search the a filtered list of maps for the data argument
		var searcher = new fuzzysearch(page_list, ['title'], { sort: true });
		var possible_maps = searcher.search(data_arg);

		// Handle no matching map name.
		if(possible_maps.length < 1) {
			res.status(200).send('The search term \"' + data_arg + '\" yielded no results.');
			return;
		}

		// Return the uri of the map page based its' title
		return'https://liquipedia.net/starcraft2/' + possible_maps[0].title.replace(' ','_');
	})

	.then(function (generated_uri) {
		// Request the html for the map's wikipage.
		rp({
			method: 'GET',
			uri: generated_uri,
			gzip: true,
			headers: {
				'User-Agent': 'Sc2 Info SlackBot/v1.0 (https://github.com/seanbud/sc2-info-slackapp/; sbudning@gmail.com)'
			}
		})
		.then(function (response_html) {
			// Use cheerio to scrape the url of the first image off the page.
			const $ = cheerio.load(response_html);
			const img_url = 'https://liquipedia.net' + $('a > img')[0].attribs['src'];
			console.log('Serving :  ' + img_url + '\n');
			res.status(200).send(img_url);
		})
		.catch(function (err) { 
			throw err; 
		});
	})

	.catch(function (err) {
		console.error(err);
	});
});

app.listen(8000, function(){
	console.log('starting server -- listening on port 8000.');
});