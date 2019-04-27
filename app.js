// For making requests
var rp = require('request-promise');

// For parsing, scraping data
var fuzzysearch = require('fuzzy-search');
var cheerio = require('cheerio');

// framework, app setup
var express = require('express');
var app = express();
app.use(express.urlencoded({extended: false}));
app.use(express.static(__dirname + '/public'));
// require('dotenv').config(); // only used for testing on localhost



// Start Server
var PORT = process.env.PORT || 8000;
app.listen(PORT, function(){
	console.log('starting server -- listening on port ' + PORT + '.\n');
});

// App Homepage
app.get('/', function(req,res){
	res.sendFile(__dirname + '/index.html');
});

// Authenticate
app.get('/oauth', (req, res) => {
    rp({
        method: 'GET',
        uri: 'https://slack.com/api/oauth.access?code='
            +req.query.code+
            '&client_id='+process.env.CLIENT_ID+
            '&client_secret='+process.env.CLIENT_SECRET,
	    transform: (body) => { return JSON.parse(body); }
    })
    .then( function (JSONresponse){
        if (!JSONresponse.ok){
            var err_msg = "Error encountered while authenticating: " + JSON.stringify(JSONresponse);
            console.log(err_msg);
            res.send(err_msg).status(200).end();
        } else {
            console.log(JSONresponse)
            res.send("Success!");
        }
    })
})

// Display sc2 Map
app.post('/map', 
	// Respond imediately to the POST request, then continue
	function (req, res, next) {
		// Handle help msg
		if(req.body.text === 'help') {
			res.status(200).send(slack_helpmsg_map);
			return;
		}

		// Otherwise, respond 200 and continue.
		res.status(200).type('json').json({ response_type: "in_channel" });
		console.log('POST request to \'' + req.body.command + '\', with data: \'' + req.body.text + '\'');
		next();
	}, 
	
	// Query a list of pages from the Liquipedia API ("Category:Maps")
	//	parse, filter, and return a list of map titles.
	function (req, res) {
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
							.map(page => page.title );
			}
		})

		// Fuzzy-search for the most relevant map. 
		//	Request liquipedia page, scrape the img.
		//	 Send POST to slack, show the map image and title.
		.then(function (map_list) {
			var searcher = new fuzzysearch(map_list, [], { sort: true });
			var search_results = searcher.search(req.body.text);

			// Check for 0 matching map results
			if(search_results.length < 1) {
				slack_response_noresults(req.body.response_url, req.body.text);
				return;
			}

			// Get a uri for the map's liquipedia page
			var map_title = search_results[0];
			var map_page_uri = 'https://liquipedia.net/starcraft2/' + map_title.replace(' ','_');

			// Request the html for the related map page
			rp({
				method: 'GET',
				uri: map_page_uri,
				gzip: true,
				headers: {
					'User-Agent': 'Sc2 Info SlackBot/v1.0 (https://github.com/seanbud/sc2-info-slackapp/; sbudning@gmail.com)'
				}
			})
			
			.then(function (response_html) {
				// Use cheerio to scrape the url of the first image off the page.
				const $ = cheerio.load(response_html);
				const img_url = 'https://liquipedia.net' + $('a > img')[0].attribs['src'];

				// Report to server console
				console.log('Serving :  ' + img_url);

				// Send a second and final response to slack.
				//	Show the map image and title.
				slack_response_showimage(req.body.response_url, map_title, img_url);
			})
		})
		
		// Log errors to server
		.catch(function (err) {
			console.error(err);
		});
});


// Slack Responses -----------------
function slack_response_noresults(response_url, search_term) {
	rp({
		method: 'POST',
		uri: response_url,
		body: {
			'response_type': "in_channel",
			'text': 'The search term \"' + search_term + '\" yielded no results.'
		},
		json: true
	});
};

function slack_response_showimage(response_url, img_title, img_url) {
	rp({
		method: 'POST',
		uri: response_url,
		json: true,
		body: {
			'response_type': 'in_channel',
			'attachments': [{
				'title': img_title,
				'fallback': 'image of ' + img_title,
				'image_url': img_url
			}]
		}
	});
};

const slack_helpmsg_map = 'Command */map* _<map name>_ , where _map name_ is the name of an sc2 map. '+
	'I will reply with the closest matching map title and image. \n\n'+
	'For example, ```/map habit station``` will pull up the map *Habitation Station*.\n';

// ----------------------------------

