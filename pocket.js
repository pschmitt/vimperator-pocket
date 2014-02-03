/*
 * pocket.js
 * read it later apiをたたく
 * API Reffernce : https://getpocket.com/api/docs/
 * TODO:ADDにbufferからのリストを入れられるように
*/

let PLUGIN_INFO = xml`
<VimperatorPlugin>
	<name>pocket</name>
	<description lang="ja">Pocket を快適に使うためのプラグインです</description>
	<version>0.5.0</version>
	<minVersion>3.0</minVersion>
	<author mail="ninja.tottori@gmail.com" homepage="http://twitter.com/ninja_tottori">ninja.tottori</author>
	<updateURL>https://github.com/vimpr/vimperator-plugins/raw/master/pocket.js</updateURL>
	<detail lang="ja"><![CDATA[

	Q.これは何？
	A.Read it Later を快適に使うためのプラグインです

	注意1.
		パスワードマネージャに依存してるので、PocketのID/PWをパスワードマネージャに登録しておく必要があります。

	注意2.
		API Key を使うので
		https://getpocket.com/api/signup/
		から自分のAPI Keyを取得して
		rcファイルに let g:pocket_consumer_key = "api key" と書いておいた方が良いと思います。
		デフォルトではあらかじめ私が取得したAPI Key使ってますが、一定時間内のリクエスト数などに制限があるみたいです。
		同じキーで1時間に10000回コールするとアレされるそうなので、チームotsuneの方達などは独自で取った方がいいかと思います。


		== Command ==
	:ril
	:ril add
		今見ているページのurlとtitleを登録します
		オプションとして url , title が選べるので適当に編集して登録もできます。
		また、URL の補完も効きます。
		URL補完は let g:pocket_complete = "slf" のようにして使用する補完を選択できます。

	:ril open
		<Space>で補完にpocketのリストが出てくるので、任意のURLを選択(<Space>)して実行すると新しいタブに開きます。
		:ril open! と!をつけると既読のみ補完に表示されます。

		また、開くと同時に既読フラグを立てに行く事ができます。
		let g:pocket_open_as_read = 1
		としてもらえれば大丈夫です。

	:ril read
		既読フラグを立てる為のサブコマンドです。
		openした時に既読にしたくないっていう人はこれを使って既読フラグを立てて下さい。

	:ril stats
		since, list, unread, read の情報がとれます


	]]></detail>
</VimperatorPlugin>`;


(function(){

	let listOptions = [ // {{{
		[['-filter', '-f'], commands.OPTION_STRING, null, []]
	]; // }}}

function print_r(arr, level) {

	var dumped_text = "";
	if (!level) level = 0;

	//The padding given at the beginning of the line.
	var level_padding = "";
	var bracket_level_padding = "";

	for (var j = 0; j < level + 1; j++) level_padding += "    ";
	for (var b = 0; b < level; b++) bracket_level_padding += "    ";

	if (typeof(arr) == 'object') { //Array/Hashes/Objects
		dumped_text += "Array\n";
		dumped_text += bracket_level_padding + "(\n";
		for (var item in arr) {

			var value = arr[item];

			if (typeof(value) == 'object') { //If it is an array,
				dumped_text += level_padding + "[" + item + "] => ";
				dumped_text += print_r(value, level + 2);
			} else {
				dumped_text += level_padding + "[" + item + "] => " + value + "\n";
			}

		}
		dumped_text += bracket_level_padding + ")\n\n";
	} else { //Stings/Chars/Numbers etc.
		dumped_text = "===>" + arr + "<===(" + typeof(arr) + ")";
	}

	return dumped_text;

}

	function listCompleter(context,args){ // {{{

		function sortDate(store){
			let ary = [];
			for (let s in store){
				ary.push([s[1].time_updated,s[1]]); // 更新日でソート
			}
			ary.sort(function(a,b){return -(a[0] - b[0])});
			return ary;
		}

		context.title = ["url","title"]
		context.filters = [CompletionContext.Filter.textDescription]; // titleも補完対象にする
		context.compare = void 0;
		context.anchored = false;
		context.incomplete = true;

		ListCache[args.bang ? 'all' : 'unread'].get(function(data){
			let filter = function () true;
			if (args['-filter']) {
				let matcher = {
					filter: args['-filter'],
					match: CompletionContext.prototype.match
				};
				filter = function (item) (matcher.match(item.url) || matcher.match(item.title));
			}

			context.completions = [
				[item.url,item.title]
				for([, item] in Iterator(data.list))
				if(
					!args.some(function (arg) arg == item.url)
					&&
					filter(item)
				)
			];
			context.incomplete = false;
		});

	} //}}}

	commands.addUserCommand(["ril","pocket"],	"Pocket plugin",
		function(args){
			addItemByArgs(args);
		},
		{
		subCommands: [
			new Command(["add","a"], "Add a page to a user's list",
				function (args) {
					addItemByArgs(args);
				},{
				literal: 0,
				options : [
					[["url","u"],commands.OPTION_STRING,null,
							(function(){
							return [[ buffer.URL ,"target url"]]
						})
					],

					[["title","t"],commands.OPTION_STRING,null,
							(function(){
							return [[ buffer.title ,"title"]]
						})
					],
				],
				completer: function (context, args) completion.url(context, liberator.globalVariables.pocket_complete)
				}
			),

			/*
			new Command(["get","g"], "Retrieve a user's reading list",
				function (args) {
					ListCache.unread.update(true, function(data) echo(countObjectValues(data.list) + " found."));
				},{
				options : [
					//[["num"],commands.OPTION_INT],
					//[["read","-r"],commands.OPTION_NOARG],
					//[["tags","-t"],commands.OPTION_NOARG],
					//[["myAppOnly"],commands.OPTION_NOARG],
				],
				}
			),
			*/

			new Command(["open","o"], "Open url in new tab from RIL list.",
				function (args) {
					liberator.open(args, liberator.NEW_BACKGROUND_TAB);
					if(liberator.globalVariables.pocket_open_as_read == 1) markAsRead(args);
				},{
					bang: true,
					completer : listCompleter,
					options: listOptions
				}
			),

			new Command(["read","r"], "Mark item(s) as read.",
				function (args) {
					markAsRead(args);
				},{
					bang: true,
					completer : listCompleter,
					options: listOptions
				}
			),

			new Command(["unread","u"], "Mark item(s) as read.",
				function (args) {
					markAsUnread(args);
				},{
					bang: true,
					completer : listCompleter,
					options: listOptions
				}
			),
			new Command(["delete","d"], "Delete item(s)",
				function (args) {
					deleteArticle(args);
				},{
					bang: true,
					completer : listCompleter,
					options: listOptions
				}
			),
			new Command(["favorite","f"], "Mark item(s) as favorite",
				function (args) {
					markAsFavorite(args);
				},{
					bang: true,
					completer : listCompleter,
					options: listOptions
				}
			),

			new Command(["stats","s"], "Retrieve information about a user's list",
				function (args) {
					Pocket.stats();
				},{}
			),

			new Command(["test"], "Return stats / current rate limit information about your API key",
				function () {
					Pocket.apiTest();
				},{}
			),
			new Command(["oauthreq"], "Login to Pocket",
				function () {
					Pocket.auth_req(/*function() {
						alert("AUTH");
						Pocket.auth();
					}*/);
				},{}
			),
			new Command(["oauth"], "Login to Pocket",
				function () {
					Pocket.auth();
				},{}
			),
			new Command(["debug"], "Debug",
				function () {
					Pocket.debug();
				},{}
			),
			new Command(["sync"], "Sync",
				function () {
					Pocket.get();
				},{}
			),
		],
		},
		true
	);

	const CacheStore = storage.newMap("pocket",{store:true});

  // Cache {{{
	function Cache ({updater, name, limit}) {
		this.limit = limit || 10 * 1000 * 60;
		this.name = name;
		this.updater = updater;
	}

	Cache.prototype = {
		get cache() CacheStore.get(name, void 0),
		set cache(value) CacheStore.set(name, value),

		get: function(callback){ // {{{
			let self = this;

			if (this.isExpired || !this.cache) {
				this.lastUpdated = new Date().getTime();
				this.update(true, callback);
				return;
			}

			callback(this.cache);
		}, // }}}

		update: function(force, callback){ // {{{
			if (!force && !this.isExpired)
				return;

			let self = this;

			liberator.log('[Pocket] cache updating');
			this.updater(function(data){
				self.cache = data;
				if (callback) callback(data);
			});
		}, //}}}

		save: function() CacheStore.save(),

		get isExpired() (!this.lastUpdated || (new Date().getTime() > (this.lastUpdated + this.limit))),
		remove: function(url){ // {{{
			if (!this.cache)
				return this.udpate(true);
			let names = [n for ([n, v] in Iterator(this.cache.list)) if (v.url == url)];
			for (let [, name] in Iterator(names))
				delete this.cache.list[name];
			this.save();
			this.update();
		} // }}}
	};
  // }}}

	let Pocket = {
		consumer_key : (liberator.globalVariables.pocket_consumer_key) ? liberator.globalVariables.pocket_consumer_key : "23278-c7925a9b346ff568386d5549",
		// TODO save this in a cookie or maybe even discard?
		oauth_code : '',
		redirect_uri : 'http://junk.lxl.io/pocket',
		oauth_token : (liberator.globalVariables.pocket_oauth_token) ? liberator.globalVariables.pocket_oauth_token : '',

		auth_req: function(state, callback) { // {{{
		// document => https://getpocket.com/api/docs#get

		let manager = Components.classes["@mozilla.org/login-manager;1"].getService(Components.interfaces.nsILoginManager);
		let logins = manager.findLogins({},"http://getpocket.com","",null);

		let req = new libly.Request(
			"https://getpocket.com/v3/oauth/request" , // url
			null, // headers
			{ // options
			asynchronous:true,
			postBody:getParameterMap(
				{
				consumer_key : this.consumer_key,
				redirect_uri : this.redirect_uri,
				format    : "json",
				}
			)
			}
		);

		req.addEventListener("success",function(data){
			let code = data.responseText;
			Pocket.oauth_code = code.match(/code=(.+)$/)[1];
			echo("Auth code:" + Pocket.oauth_code);

			// Open new tab
			var win=window.open("https://getpocket.com/auth/authorize?request_token=" + Pocket.oauth_code + "&redirect_uri=" + Pocket.redirect_uri, '_blank');
			win.focus();
			// TODO React to oauth suceeded/failed (via callback url)
			Pocket.auth();
		});

		req.addEventListener("failure",function(data){
			liberator.echoerr(data.statusText);
			liberator.echoerr(data.responseText);
		});

		req.post();

		}, // }}}

		auth: function(state, callback) { // {{{
		// document => https://getpocket.com/api/docs#get

		let manager = Components.classes["@mozilla.org/login-manager;1"].getService(Components.interfaces.nsILoginManager);
		let logins = manager.findLogins({},"http://getpocket.com","",null);

		let req = new libly.Request(
			"https://getpocket.com/v3/oauth/authorize" , // url
			null, // headers
			{ // options
			asynchronous:true,
			postBody:getParameterMap(
				{
				consumer_key : this.consumer_key,
				code    	 : this.oauth_code,
				format : "json",
				}
			)
			}
		);

		req.addEventListener("success",function(data) {
			let token = data.responseText;
			Pocket.oauth_token = token.match(/access_token=(.+)&username=.*$/)[1];
			echo("Token: " + Pocket.oauth_token);
			util.copyToClipboard(Pocket.oauth_token);
		});
		req.addEventListener("failure",function(data){
			liberator.echoerr(data.statusText);
			liberator.echoerr(data.responseText);
			// Pocket.debug();
		});

		req.post();

		}, // }}}

		get : function(state, callback){ // {{{
		// API: http://getpocket.com/developer/docs/v3/retrieve
		let manager = Components.classes["@mozilla.org/login-manager;1"].getService(Components.interfaces.nsILoginManager);
		let logins = manager.findLogins({},"http://getpocket.com","",null);

		let req = new libly.Request(
			"https://getpocket.com/v3/get" , // url
			null, // headers
			{ // options
			asynchronous:true,
			postBody:getParameterMap(
				{
				consumer_key : this.consumer_key,
				access_token : this.oauth_token,
				format    	 : "json",
				count     	 : (liberator.globalVariables.pocket_get_count? liberator.globalVariables.pocket_get_count : 100 ),
				state     	 : state
				}
			)
			}

		);

		req.addEventListener("success",function(data){
			liberator.echo("[Pocket] Sync completed");
			// alert(print_r(ListCache));
			callback(libly.$U.evalJson(data.responseText));
		});
		req.addEventListener("failure",function(data){
			liberator.echoerr(data.statusText);
			liberator.echoerr(data.responseText);
		});

		req.post();

		}, // }}}

		add : function(url,title,callback){ // {{{

		let manager = Components.classes["@mozilla.org/login-manager;1"].getService(Components.interfaces.nsILoginManager);
		let logins = manager.findLogins({},"https://getpocket.com","",null);
		let req = new libly.Request(
			"https://getpocket.com/v3/add" , // url
			null, // headers
			{ // options
			asynchronous:true,
			postBody:getParameterMap(
				{
				consumer_key : this.consumer_key,
				access_token : this.oauth_token,
				url       : url,
				title     : title,
				}
			)
			}

		);

		req.addEventListener("success",callback);
		req.addEventListener("failure",function(data){
			liberator.echoerr(data.statusText);
			liberator.echoerr(data.responseText);
		});

		req.post();

		}, // }}}

		send : function(urls, action, callback) { //{{{
		// API https://getpocket.com/developer/docs/v3/modify

		let manager = Components.classes["@mozilla.org/login-manager;1"].getService(Components.interfaces.nsILoginManager);
		let logins = manager.findLogins({},"https://getpocket.com","",null);
	
		// TODO: Move this  upstream (upward)	
		if (urls.length < 1) {
			urls = [content.location.href];
		}
		
		function get_item_id(args) {
			for (var item in ListCache.unread.cache.list) { 
				item = ListCache.unread.cache.list[item];
				// liberator.echo(print_r(item));
				// liberator.echo(item["resolved_url"] + " =? " + args);
				if (item["resolved_url"] == args || item["given_url"] == args) {
					// alert("URL: " + args + " id: " + item["item_id"]);
					// liberator.echo("URL: " + args + " id: " + item["item_id"]);
					return item["item_id"];
				}
			}
			return "";
		}

		function make_read_list(args, act){
			let o = [{}];
			for (let i = 0; i < args.length; i++) {
				o[i] = {"action":act, "item_id":get_item_id(args[i])};
			}
			return JSON.stringify(o);
		}

		// https://getpocket.com/developer/docs/v3/modify
		let req = new libly.Request(
			"https://getpocket.com/v3/send" , // url
			null, // headers
			{ // options
				asynchronous:true,
				postBody:getParameterMap(
					{
					consumer_key : this.consumer_key,
					access_token : this.oauth_token,
					actions      : make_read_list(urls, action),
					format       : "json",
					}
				)
			}
		);

		var ref = this;
		req.addEventListener("success",function(data) {
			callback(data);
		});

		req.addEventListener("failure",function(data){
			liberator.echoerr(data.statusText);
			liberator.echoerr(data.responseText);
		});

		req.post();

		}, // }}}

		stats : function(){ // {{{

		let manager = Components.classes["@mozilla.org/login-manager;1"].getService(Components.interfaces.nsILoginManager);
		let logins = manager.findLogins({},"https://getpocket.com","",null);
		let req = new libly.Request(
			"https://getpocket.com/v3/stats" , // url
			null, // headers
			{ // options
				asynchronous:true,
				postBody:getParameterMap(
					{
					consumer_key : this.consumer_key,
					access_token : this.oauth_token,
					format       : "json",
					}
				)
			}

		);

		req.addEventListener("success",function(data){
			let res = libly.$U.evalJson(data.responseText);
			liberator.echo(xml`
			<style type="text/css"><![CDATA[
				div.stats{font-weight:bold;text-decoration:underline;color:gold;padding-left:1em;line-height:1.5em;}
			]]></style>` +
			xml`<div>#Pocket Stats</div>` +
			xml`<div class="stats">
				since : ${unixtimeToDate(res.user_since)} <br />
				list : ${res.count_list} <br />
				unread : ${res.count_unread} <br />
				read : ${res.count_read} <br />
			</div>
			`);
		});

		req.addEventListener("failure",function(data){
			liberator.echoerr(data.statusText);
			liberator.echoerr(data.responseText);
		});

		req.post();

		}, // }}}

		apiTest : function(){ // {{{

		let req = new libly.Request(
			"https://getpocket.com/v3/api" , // url
			null, // headers
			{ // options
			asynchronous:true,
			postBody:getParameterMap(
				{
				consumer_key  : this.consumer_key,
				}
			)
			}

		);

		req.addEventListener("success",function(data){
			liberator.echo(xml`
			<div>
				X-Limit-User-Limit : ${data.transport.getResponseHeader("X-Limit-User-Limit")} <br />
				X-Limit-User-Remaining : ${data.transport.getResponseHeader("X-Limit-User-Remaining")} <br />
				X-Limit-User-Reset : ${data.transport.getResponseHeader("X-Limit-User-Reset")} <br />
				X-Limit-Key-Limit : ${data.transport.getResponseHeader("X-Limit-Key-Limit")} <br />
				X-Limit-Key-Remaining : ${data.transport.getResponseHeader("X-Limit-Key-Remaining")} <br />
				X-Limit-Key-Reset : ${data.transport.getResponseHeader("X-Limit-Key-Reset")} <br />

			</div>
			`);
		});

		req.addEventListener("failure",function(data){
			liberator.echoerr(data.statusText);
			liberator.echoerr(data.responseText);
		});

		req.post();

		}, // }}}

		debug : function() {
			alert("Consumer Key: " + this.consumer_key + " Token: " + this.oauth_token);
		},
	}

	let ListCache = {
		all: new Cache({name: 'list', updater: Pocket.get.bind(Pocket, '')}),
		unread: new Cache({name: 'list', updater: Pocket.get.bind(Pocket, 'unread')})
	};

	function deleteArticle(urls){ // {{{
		for (let [, url] in Iterator(urls))
			ListCache.unread.remove(url);
		Pocket.send(urls, "delete", echo.bind(null, "Deleted: " + urls.length));
	} // }}}

	function markAsFavorite(urls){ // {{{
		Pocket.send(urls, "favorite", echo.bind(null, "Favorited: " + urls.length > 0 ? url.length : urls[0]));
	} // }}}

	function markAsUnread(urls){ // {{{
		// TODO This is probably not working the same way as the others
		for (let [, url] in Iterator(urls))
			ListCache.unread.remove(url);
		Pocket.send(urls, "readd", echo.bind(null, "Mark as read: " + urls.length));
	} // }}}

	function markAsRead(urls){ // {{{
		for (let [, url] in Iterator(urls))
			ListCache.unread.remove(url);
		Pocket.send(urls, "archive", echo.bind(null, "Mark as unread: " + urls.length));
	} // }}}

	function addItemByArgs(args){ // {{{
		let url = args["url"] || args.literalArg;
		let title = args["title"] || (url ? undefined : buffer.title);
		if (!url)
			url = buffer.URL;
		Pocket.add(url, title, function(){
			echo("Added: " + (title || url));
			ListCache.unread.update(true);
		});
	} // }}}

	function echo(msg){ // {{{
		liberator.echo("[Pocket] " + msg);
	} // }}}

	function unixtimeToDate(ut) { // {{{
		var t = new Date( ut * 1000 );
		t.setTime( t.getTime() + (60*60*1000 * 9) ); // +9は日本のタイムゾーン
		return t;
	} // }}}

	function getParameterMap(parameters){ // {{{
		return [
			key + "=" + encodeURIComponent(value)
			for ([key, value] in Iterator(parameters))
			if (value)
		].join("&");
	} // }}}

  function countObjectValues(obj){ // {{{
    return [1 for (_ in Iterator(obj))].length;
  } // }}}

	// for debug {{{
	function e(v,c){
		if(c) util.copyToClipboard(v);
		liberator.log(v,-1)
	} // }}}

	// Export {{{
	__context__.ListCache = ListCache;
	__context__.API = Pocket;
	__context__.WrappedAPI = {
		markAsRead: markAsRead
	}
	// }}}

})();

// vim: set noet :
