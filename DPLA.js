{
	"translatorID": "117feb72-21bb-4424-a47b-c9ca6b71f979",
	"label": "DPLA",
	"creator": "Sebastian Karcher",
	"target": "^https?://dp.la/",
	"minVersion": "3.0",
	"maxVersion": "",
	"priority": 100,
	"inRepository": true,
	"translatorType": 4,
	"browserSupport": "g",
	"lastUpdated": "2013-04-18 22:27:50"
}

/**
	Copyright (c) 2012 Sebastian Karcher
	
	This program is free software: you can redistribute it and/or
	modify it under the terms of the GNU Affero General Public License
	as published by the Free Software Foundation, either version 3 of
	the License, or (at your option) any later version.
	
	This program is distributed in the hope that it will be useful,
	but WITHOUT ANY WARRANTY; without even the implied warranty of
	MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE. See the GNU
	Affero General Public License for more details.
	
	You should have received a copy of the GNU Affero General Public
	License along with this program. If not, see
	<http://www.gnu.org/licenses/>.
*/

function detectWeb(doc, url) {
	if (url.indexOf("/search?") != -1) return "multiple";

	else if (url.indexOf("/item/") != -1) {
		var type = ZU.xpathText(doc, '//article[@id="content"]/div[@class="table"]/ul/li[h6[contains(text(), "Type")]]/following-sibling::li')
		//Z.debug(type)
		//we can't use the typemap below, as the types get merged together when scraping them
		if (type.search(/^(image|physical)/) != -1) return "artwork";
		else if (type.search(/^(image|physical)/) != -1) return "artwork";
		else if (type.search(/^sound/) != -1) return "audioRecording";
		else if (type.search(/^moving/) != -1) return "film";
		else if (type.search(/^software/) != -1) return "computerProgram";
		else if (type.search(/^(dataset|interactive)/) != -1) return "webpage";
		else return "book";
	}
}

function doWeb(doc, url) {
	//take this code mostly from pubmed, which has a very similar API structure
	if (detectWeb(doc, url) == "multiple") {
		var results = ZU.xpath(doc, '//div[@class="search"]//h4/a[contains(@href, "/item/")]');
		var items = {};
		var title, id;
		for (var i = 0, n = results.length; i < n; i++) {
			title = results[i].textContent;
			id = results[i].href.match(/item\/([^\?]+)/)[1]

			if (id && title) {
				// Keys must be strings. Otherwise, Chrome sorts numerically instead of by insertion order.
				items["j" + id] = title;
			}
		}

		Zotero.selectItems(items, function (selectedItems) {
			if (!selectedItems) return true;

			var ids = [];
			for (var i in selectedItems) {
				ids.push(i.substr(1));
			}
			getJSON(ids);
		});
	} else {
		var id = url.match(/item\/([^\?]+)/)[1];
		getJSON([id]);
	}
}

function getJSON(ids) {
	Z.debug(ids)
	var JASONurl = "http://api.dp.la/v2/items/" + ids.join(",") + "?api_key=910de961922b85c6e95ee1311938ece6";
	Zotero.Utilities.doGet(JASONurl, parseDPLAapi);
}

var typemap = {
	"image": "artwork",
	"physical object": "artwork",
	"text": "book",
	"collection": "book",
	"moving image": "film",
	"interactive resource": "webpage",
	"dataset": "webpage",
	"software": "computerProgram",
	"sound": "audioRecording"
}

function parseDPLAapi(text) {
	try {
		var obj = JSON.parse(text).docs;
	} catch (e) {
		Zotero.debug("JSON parse error");
		throw e;
	}

	for (i in obj) {
		var data = obj[i]
		var source = data.sourceResource
		//Z.debug(source)
		var item = new Zotero.Item("book");
		//a lot of fields come either as arrays or as strings - check for that, else we'll get ugliness esp. when we expect an array.
		if (typeof source.title === "string") item.title = source.title;
		else item.title = source.title[0];
		if (source.date) item.date = source.date.displayDate;
		var pubinfo = source.publisher;
		if (pubinfo) {
			if (pubinfo.indexOf(":") != -1) {
				pubinfo = pubinfo.match(/([^:]*):\s*(.+)/);
				item.place = pubinfo[1];
				item.publisher = pubinfo[2];
			}
		}
		//authors are sometimes strings, sometimes arrays
		if (typeof source.creator === "string") {
			var fieldmode = 2;
			var comma = true;
			if (source.creator.indexOf(",") == -1) {
				fieldmode = 1;
			}
			item.creators.push(ZU.cleanAuthor(source.creator, "author", true))
			item.creators[0].fieldMode = fieldmode;
		} else {
			for (i in source.creator) {
				var fieldmode = 2;
				var comma = true;
				if (source.creator[i].indexOf(",") == -1) {
					fieldmode = 1;
				}
				item.creators.push(ZU.cleanAuthor(source.creator[i], "author", true))
				item.creators[i].fieldMode = fieldmode;
			}
		}
		if (typeof source.description === "string") {
			item.abstractNote = source.description;
		}
		//description could be either tag or abstract, but overall abstract makes more sense;
		else {
			var abstract = [];
			for (i in source.description) {
				abstract.push(source.description[i]);
			}
			item.abstractNote = abstract.join("; ");
		}
		for (i in source.subject) {
			item.tags.push(source.subject[i].name);
		}
		if (!item.place) {
			if (source.spatial) {
				if (source.spatial[0].city) item.place = source.spatial[0].city;
				else if (source.spatial[0].name) item.place = source.spatial[0].name;
			}
		}

		if (source.format && typeof source.format === "string") item.medium = source.format;
		else if (source.format) {
			format = [];
			for (i in source.format) {
				format.push(source.format[i]);
				item.medium = format.join(", ");
			}
		}
		item.attachments.push({
			url: "http://dp.la/item/" + data.id,
			title: "DPLA Link",
			mimeType: "text/html",
			snapshot: false
		})
		item.rights = source.rights;
		item.url = data.isShownAt;
		item.archive = data.dataProvider;
		if (source.language) {
			if (source.language.iso639_3) item.language = source.language.iso639_3;
			else if (source.language.iso639_2) item.language = source.language.iso639_2;

		}
		var type = source.type;
		if (typeof type != "string") type = type[0];
		if (typemap[type]) item.itemType = typemap[type];
		item.complete();
	}
}/** BEGIN TEST CASES **/
var testCases = [
	{
		"type": "web",
		"url": "http://dp.la/search?&q=labor&utf8=%E2%9C%93",
		"items": "multiple"
	},
	{
		"type": "web",
		"url": "http://dp.la/item/100b1a8594ff7d162e13ff9dfca27c3d",
		"items": [
			{
				"itemType": "artwork",
				"creators": [],
				"notes": [],
				"tags": [
					"Palmer, William R., 1877-1960",
					"Portraits"
				],
				"seeAlso": [],
				"attachments": [
					{
						"title": "DPLA Link",
						"mimeType": "text/html",
						"snapshot": false
					}
				],
				"title": "O. W. Croxall",
				"date": "1899-08",
				"rights": "Digital image c1999 Sherratt Library, Southern Utah University. All rights reserved.",
				"abstractNote": "O. W. Croxall; Photographs",
				"url": "http://thoth.library.utah.edu:1701/primo_library/libweb/action/dlDisplay.do?vid=MWDL&afterPDS=true&docId=digcoll_suu_13palmer/918",
				"archive": "Southern Utah University - Sherratt Library",
				"libraryCatalog": "DPLA",
				"accessDate": "CURRENT_TIMESTAMP"
			}
		]
	},
	{
		"type": "web",
		"url": "http://dp.la/item/b3d8c3ad9a97610d77eb9c53c7def845?back_uri=http%3A%2F%2Fdp.la%2Fsearch%3Fq%3Dlabor%26type%255B%255D%3Dsound%26utf8%3D%25E2%259C%2593",
		"items": [
			{
				"itemType": "audioRecording",
				"creators": [
					{
						"firstName": "Mary",
						"lastName": "Moultrie",
						"creatorType": "author",
						"fieldMode": 2
					},
					{
						"firstName": "Jean-Claude",
						"lastName": "Bouffard",
						"creatorType": "author",
						"fieldMode": 2
					}
				],
				"notes": [],
				"tags": [
					"African American nurses--South Carolina Charleston",
					"African Americans--Civil rights--South Carolina--Charleston",
					"African Americans--South Carolina--Charleston--History--20th century",
					"African Americans--South Carolina--Charleston--Social conditions",
					"Char",
					"Leston (S.C.)--Race",
					"Relations--History--20th century",
					"Clark, Septima Poinsette, 1898-1987",
					"Hospital Workers' Strike, Charleston, S.C., 1969",
					"Hospitals--Employees--Labor unions--South Carolina Charleston",
					"Hospitals--Employees--Salaries, etc",
					"Hospitals--South Carolina--Charleston--History--20th century",
					"Labor unions--South Carolina--Charleston",
					"McCor",
					"D, William M. (William Mellon), 1907-1996",
					"Medical College of South Car",
					"Olina (1952-1969)--Histo",
					"Moultrie, Mary",
					"Race discrimination--South Carolina--History",
					"Saunders, William, 1935-",
					"Southern Christian Leadership Conference",
					"Strikes and lockouts--Hospitals--South Carolina",
					"Women--Employment--South Carolina--Charleston"
				],
				"seeAlso": [],
				"attachments": [
					{
						"title": "DPLA Link",
						"mimeType": "text/html",
						"snapshot": false
					}
				],
				"title": "Oral History Interview with Mary Moultrie",
				"date": "1982-07-28",
				"rights": "Digital resource copyright 2010, Avery Research Center at the College of Charleston Libraries. All rights reserved. For more information contact the Avery Research Center, College of Charleston, Charleston, SC 29424.",
				"abstractNote": "In this interview, Mary Moultrie (born 1943) talks about her involvement in the 113-day Charleston Hospital Strike at the Medical University of South Carolina (MUSC) in March 1969. After graduating from Burke High School in 1960, Moultrie went to Goldwater Memorial Hospital, New York to become a Licensed Practical Nurse (LPN). In 1967, she returned to Charleston and was hired at MUSC only as a nurses assistant since her LPN was not accepted. She speaks in detail about the working conditions and employee relationships at MUSC prior to and after the strike. Ms. Moultrie explains the various types of nursing titles and the unequal pay between black and white nurses. She retells in detail how the racial tensions that led up to the strike at MUSC increased due to the harassing treatment toward black nurses. In the interview, Moultrie details the first informal meetings and get-togethers that were held, until the black nurses joined forces with the 1199 union and Bill Saunders. Moultrie elaborates, in particular, on the lack of support from the white community under the Gaillard administration, as well as the hesitation of the black community to join them in their efforts for equal pay and treatment. She then refers to support from the Southern Christian Leadership Conference (SCLC), Septima Poinsette Clark, and various leaders such as Andrew Young and Ralph Abernathy. Moultrie mentions the difficult and hostile negotiation process with MUSCs president Dr. William McCord and the memorandum of agreement that was ultimately reached. The interview closes by the interviewer inquiring about the current work force diversity at MUSC and Moultries feelings regarding the strikes accomplishments.",
				"place": "Charleston",
				"medium": "2 Cassettes, Audio",
				"url": "http://lowcountrydigital.library.cofc.edu/u?/AOH,203",
				"archive": "Avery Research Center at the College of Charleston",
				"libraryCatalog": "DPLA",
				"accessDate": "CURRENT_TIMESTAMP"
			}
		]
	},
	{
		"type": "web",
		"url": "http://dp.la/item/9824dc12222f81e6040f85db570a2a32?back_uri=http%3A%2F%2Fdp.la%2Fsearch%3Flanguage%255B%255D%3DSpanish%26q%3Dlabor%26utf8%3D%25E2%259C%2593",
		"items": [
			{
				"itemType": "book",
				"creators": [
					{
						"firstName": "Mariano",
						"lastName": "Cuevas",
						"creatorType": "author",
						"fieldMode": 2
					}
				],
				"notes": [],
				"tags": [
					"Catholic Church",
					"Catholic Church",
					"Missions"
				],
				"seeAlso": [],
				"attachments": [
					{
						"title": "DPLA Link",
						"mimeType": "text/html",
						"snapshot": false
					}
				],
				"title": "Historia de la Iglesia en México, v. 2",
				"date": "1921",
				"place": "Tlalpam [D.F.] (México)",
				"publisher": "Impr. del asilo \"Patricio Sanz",
				"abstractNote": "Added t.p; Bibliografia de la historia de la Iglesia en México\" : v. 1, p. [13]-27, and at head of chapters; Includes indexes; Appendices; STH LIBRARY HAS: vols. 1-3 ; later edition (1928) has vols. 4-5. See Theo Research BX1428.C8 1928; V. 1. Estado del país de Anahuac antes de su evangelización. Orígenes de la Iglesia en Nueva España, 1511-1548.--v. 2. Consolidación y actividades de las instituciones fundadoras, 1548-1572. Los elementos regeneradores, 1572-1600. Frutos especiales de la Iglesia en el Siglo XVI.--v. 3. Instituciones y labor de la Iglesia organizada. Las Misiones. Frutos de la Iglesia en el Siglo XVII",
				"url": "http://www.archive.org/details/historiadelaigle02cuev",
				"archive": "School of Theology, Boston University",
				"libraryCatalog": "DPLA",
				"accessDate": "CURRENT_TIMESTAMP"
			}
		]
	}
]
/** END TEST CASES **/