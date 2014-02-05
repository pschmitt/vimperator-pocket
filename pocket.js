/*
 * pocket.js
 * API Reference: http://getpocket.com/developer/docs/overview
*/

let PLUGIN_INFO = xml`
<VimperatorPlugin>
    <name>pocket</name>
    <description lang="en">Pocket</description>
    <version>0.5.0</version>
    <minVersion>3.0</minVersion>
    <author mail="philipp@schmitt.co" homepage="http://lxl.io">Philipp Schmitt</author>
    <updateURL>https://raw.github.com/pschmitt/vimperator-pocket/master/pocket.js</updateURL>
    <detail lang="en"><![CDATA[
        // TODO Documentation
    ]]></detail>
</VimperatorPlugin>`;


(function(){

    let listOptions = [ // {{{
        [['-filter', '-f'], commands.OPTION_STRING, null, []]
    ]; // }}}

    function listCompleter(context,args){ // {{{

        function sortDate(store){
            let ary = [];
            for (let s in store){
                ary.push([s[1].time_updated,s[1]]); // Sort by date
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
                filter = function (item) (matcher.match(item.resolved_url) || matcher.match(item.resolved_title));
            }

            context.completions = [
                [item.resolved_url,item.resolved_title]
                for([, item] in Iterator(data.list))
                if(
                    !args.some(function (arg) arg == item.resolved_url)
                    &&
                    filter(item)
                )
            ];
            context.incomplete = false;
        });

    } //}}}

    // User commands {{{
    commands.addUserCommand(["ril","pocket"],    "Pocket plugin",
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

            new Command(["open","o"], "Open url in new tab from RIL list.",
                function (args) {
                    liberator.open(args, liberator.NEW_BACKGROUND_TAB);
                    if(liberator.globalVariables.pocket_open_as_read == 1) markAsRead(args);
                },{
                    bang      : true,
                    completer : listCompleter,
                    options   : listOptions
                }
            ),

            new Command(["first","fi"], "Open first item in a new tab.",
                function () {
                    let firstItem = getItemAtPos(false, 0);
                    let firstUrl = firstItem.resolved_url != undefined ? firstItem.resolved_url : firstItem.given_url;
                    liberator.open(firstUrl, liberator.NEW_TAB);
                    if(liberator.globalVariables.pocket_open_as_read == 1) markAsRead();
                },{}
            ),

            new Command(["last","la"], "Open last item in a new tab.",
                function () {
                    let lastItem = getItemAtPos(false, countObjectValues(ListCache.unread.cache.list) - 1);
                    let lastUrl = lastItem.resolved_url != undefined ? lastItem.resolved_url : lastItem.given_url;
                    liberator.open(lastUrl, liberator.NEW_TAB);
                    if(liberator.globalVariables.pocket_open_as_read == 1) markAsRead();
                },{}
            ),

            new Command(["read","r"], "Mark item(s) as read.",
                function (args) {
                    markAsRead(args);
                },{
                    bang      : true,
                    completer : listCompleter,
                    options   : listOptions
                }
            ),

            new Command(["unread","u"], "Mark item(s) as read.",
                function (args) {
                    markAsUnread(args);
                },{
                    bang       : false,
                    completer : listCompleter,
                    options   : listOptions
                }
            ),
            new Command(["delete","d"], "Delete item(s)",
                function (args) {
                    deleteArticle(args);
                },{
                    bang      : false,
                    completer : listCompleter,
                    options   : listOptions
                }
            ),

            new Command(["favorite","f"], "Mark item(s) as favorite",
                function (args) {
                    markAsFavorite(args);
                },{
                    bang      : false,
                    completer : listCompleter,
                    options   : listOptions
                }
            ),

            new Command(["unfavorite","uf"], "Unfavorite an item",
                function (args) {
                    markAsUnfavorite(args);
                },{
                    bang      : false,
                    completer : listCompleter,
                    options   : listOptions
                }
            ),

            new Command(["stats","s"], "Retrieve information about a user's list",
                function (args) {
                    Pocket.stats();
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
                    ListCache.unread.update(true);
                },{}
            ),

            new Command(["tag"], "t",
                function () {
                    // TODO
                },{}
            ),
        ],
        },
        true
    );

// }}}

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
        consumer_key : (liberator.globalVariables.pocket_consumer_key) ? liberator.globalVariables.pocket_consumer_key : '',
        oauth_code   : '',
        redirect_uri : 'http://junk.lxl.io/pocket',
        oauth_token  : (liberator.globalVariables.pocket_oauth_token) ? liberator.globalVariables.pocket_oauth_token : '',

        auth_req: function(state, callback) { // {{{
        // API: http://getpocket.com/developer/docs/authentication

        let req = new libly.Request(
            "https://getpocket.com/v3/oauth/request" , // url
            null, // headers
            { // options
            asynchronous:true,
            postBody:getParameterMap(
                {
                consumer_key : this.consumer_key,
                redirect_uri : this.redirect_uri,
                format       : "json",
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
        // API: http://getpocket.com/developer/docs/authentication
        let req = new libly.Request(
            "https://getpocket.com/v3/oauth/authorize" , // url
            null, // headers
            { // options
            asynchronous:true,
            postBody:getParameterMap(
                {
                consumer_key : this.consumer_key,
                code         : this.oauth_code,
                format       : "json",
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

        let req = new libly.Request(
            "https://getpocket.com/v3/get" , // url
            null, // headers
            { // options
            asynchronous:true,
            postBody:getParameterMap(
                {
                consumer_key : this.consumer_key,
                access_token : this.oauth_token,
                format       : "json",
                count        : (liberator.globalVariables.pocket_get_count? liberator.globalVariables.pocket_get_count : 1000),
                state        : state
                }
            )
            }

        );

        req.addEventListener("success",function(data){
            echo("Sync completed");
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
        // API: http://getpocket.com/developer/docs/v3/add

        let req = new libly.Request(
            "https://getpocket.com/v3/add" , // url
            null, // headers
            { // options
            asynchronous:true,
            postBody:getParameterMap(
                {
                consumer_key : this.consumer_key,
                access_token : this.oauth_token,
                url          : url,
                title        : title,
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
            alert(print_r(data));
            callback(data);
        });

        req.addEventListener("failure",function(data){
            alert(print_r(data));
            liberator.echoerr(data.statusText);
            liberator.echoerr(data.responseText);
        });

        req.post();

        }, // }}}

        stats : function(){ // {{{

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
                div.stats{font-weight:bold;text-decoration:underline;color:gray;padding-left:1em;line-height:1.5em;}
            ]]></style>` +
            xml`<div>#Pocket Stats</div>` +
            xml`<div class="stats">
                <!-- since : ${unixtimeToDate(res.user_since)} <br /> -->
                list : ${res.count_list} (local: ${countObjectValues(ListCache.all.cache.list)}) -
                unread : ${res.count_unread} - (local: ${countObjectValues(ListCache.unread.cache.list)})
                read : ${res.count_read}
            </div>
            `);
        });

        req.addEventListener("failure",function(data){
            liberator.echoerr(data.statusText);
            liberator.echoerr(data.responseText);
        });

        req.post();

        }, // }}}

        debug : function() { // {{{
            alert("Consumer Key: " + this.consumer_key + " Token: " + this.oauth_token);
        }, // }}}
    }

    let ListCache = {
        all: new Cache({name: 'list', updater: Pocket.get.bind(Pocket, 'all')}),
        unread: new Cache({name: 'list', updater: Pocket.get.bind(Pocket, 'unread')})
    };

    function deleteArticle(urls){ // {{{
        if (urls.length < 1) {
            urls = [buffer.URL];
        }
        for (let [, url] in Iterator(urls))
            ListCache.unread.remove(url);

        Pocket.send(urls, "delete", echo.bind(null, "Deleted: " + urls.length > 1 ? urls.length : buffer.title));
    } // }}}

    function markAsUnfavorite(urls){ // {{{
        if (urls.length < 1) {
            urls = [buffer.URL];
        }

        Pocket.send(urls, "unfavorite", echo.bind(null, "Unfavorited: " + urls.length > 1 ? urls.length : buffer.title));
    } // }}}

    function markAsFavorite(urls){ // {{{
        if (urls.length < 1) {
            urls = [buffer.URL];
        }

       Pocket.send(urls, "favorite", echo.bind(null, "Favorited: " + urls.length > 1 ? urls.length : buffer.title));
    } // }}}

    function markAsUnread(urls){ // {{{
        // TODO This is probably not working the same way as the others
        // TODO Add to unread/all list?
        if (urls.length < 1) {
            urls = [buffer.URL];
        }
        //for (let [, url] in Iterator(urls))
        //    ListCache.unread.remove(url);
        Pocket.send(urls, "readd", echo.bind(null, "Moved back to unread list: " + urls.length > 1 ? urls.length : buffer.title));
    } // }}}

    function markAsRead(urls){ // {{{
        if (urls.length < 1) {
            urls = [buffer.URL];
        }
        for (let [, url] in Iterator(urls))
            ListCache.unread.remove(url);

        Pocket.send(urls, "archive", echo.bind(null, "Mark as unread: " + urls.length > 1 ? urls.length : buffer.title));
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

    function getItemAtPos(bang, pos) { // {{{
        var l = ListCache[bang ? 'all' : 'unread'].cache.list;
        var i = 0;
        for (var ind in l) {
            if (l.hasOwnProperty(ind)) {
                if (pos == i)  {
                    return l[ind];
                }
                else i++;
            }
        }
    } // }}}

    // Debug {{{
    function e(v,c){
        if(c) util.copyToClipboard(v);
        liberator.log(v,-1)
    }

    function print_r(arr, level) { // {{{

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
