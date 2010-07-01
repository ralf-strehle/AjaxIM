/*
    Modifications by Ralf Strehle (ralf.strehle@yahoo.de) May 2010
    
    done:
    - login / logout should work now
    - minor HTML fix in "not connected" tooltip (block level tag should not be nested in inline-tag)
    - .data('tab') replaced with .parents('.imjs-tab'), let us use as less .data as possible
    - .data('status') replaced with css classes .imjs-maximized .imjs-minimized .imjs-closed (easier to check status in html, possibility to define styles)
    - clicks reorganized
    - signature of _addMessage changed, parameter 2 is now the chatbox username
    - simplify jQuery to activate and close/hide tabs
    - making better usage of jQuery chaining (smaller, faster and more elegant)
    - class="imjs-chatbox" moved from <form> tag to wrapper <div> tag
    - opening chats imediately after login creates new tabs right of existing tabs. when a tab is removed (=hidden)
      and then activated again, it is inserted to the left of old tabs. this has been fixed.
    - close tabs unified, using only one function
    - bar object integrated with AjaxIM (flat structure, easier to understand, bar.initialize integrated with setup()
    - chatlist keeps track of opened chat windows. this can differ from the chatstore, as chatstore stores chats from closed / hidden chatboxes
    - .call replaced with parameter passing (not sure if this is really better, no problem to go back to this and .call)
    - friends parameter removed from _startSession, we directly access self.friends
    - friends box is opened on reload if it was open before (nice to have)
    - activeTab is replaced with sel attribute in chatlist. this gives possibility to keep multiple chats open (not yet implemented)
    - jQuery .live event handler for onkeydown, onkeyup, onkeypress replaced with oldschool key handler to avoid javascript errors
    - height of message input field initialized with css height = 18 to avoid dynamic height adjustment when first chars are entered
      this is working fine in FireFox, other browsers still oscilate
    - message input field reset to height = 18 after message has been sent (18 is hardcoded)
    - prototype extension with $.extend removed. back to the roots of pure javascript OOP. maybe extend later with Class.js
    - prequeue defined as instance variable
    - prequeue mechanics simplified
    - html/css simplified and standardized for chat (not for login / register)
    - bottom image in panel boxes replaced with css
    - top border removed from first friends group
    - scrollers reorganized (design, algorithm to show/hide scrollers, resume)
    - resume restores scroller state (number of hidden tabs to the left and right)
    - delete chatbox preserves scroller state
    - resume only restores tabs in chatlist
    - restore of chatbox content in moved from _resumeSession to addTab
    - parameter "display" removed from _createChatbox and _addTab
    - display indented debug and tracing message is firebug console with different debugging options
    - for(... in ...) converted back to $.each
    - prototypes extended with $.extend
    
    to do:
    - integrate jStore 2.0 (demo does not work, so discarded for now, might be not even worth it)
    - get docu for jStore 1.2 (not that hot, it's working fine now)
    - :visible in line 2170 throws an error in firebug for unknown reasons. workaround: define a style to mark tabs which are hidden
      by the scrolling subsystem, then select all tabs which are not closed and do not have this special style.
    - convert to xhtml strict, but run as xhtml transitional
    - remove #friends# from chatlist, use new var for friends tab status (not that important)
    - test dynamic addition / removal of friends upon sign-in and sign-out
    - test dynamic change of friend status (online, busy, invisible)
    - test dynamic change of own status in other's friends lists
    - integrate with osDate
    - integrate with joomla/beatz
    
    notes:
    - status classed are: imjs-maximized = tab and box are displayed
                          imjs-minimized = tab is displayed, box is hidden
                          imjs-closed = tab was active or minimized before, but is now hidden (we could also remove tab incl. box)
                          
                          imjs-selected = used in addition to imjs-maximized to mark the box which is having focus.
                                          right now, this is redundant, because only one chatbox can be maximized
                                          but we might use this later to allow maximizing of multiple chatboxes
    - tested in the big four: Firefox, IE, Safari, Chrome. Opera is either having too many css issues or jQuery support is not sufficient.
    
    bugs:
    - empty response in long polling (HIGH PRIORITY)
    - message input does not resize in IE, Safari when text is deleted. current workaround is to reset height after message sending.
    - opera bug: chat window does not close correctly when closed with X in tab (seems to be a native opera bug)
    - opera bug: chat window does not close at all when clicked on X in head. minimize does then not work any longer.
*/

// = im.js =
//
// **Copyright &copy; 2005 &ndash; 2010 Joshua Gross**\\
// //MIT Licensed//
//
// Permission is hereby granted, free of charge, to any person obtaining a copy
// of this software and associated documentation files (the "Software"), to deal
// in the Software without restriction, including without limitation the rights
// to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
// copies of the Software, and to permit persons to whom the Software is
// furnished to do so, subject to the following conditions:
//
// The above copyright notice and this permission notice shall be included in
// all copies or substantial portions of the Software.
//
// THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
// IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
// FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
// AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
// LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
// OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
// THE SOFTWARE.
//
// This is the main library for Ajax IM. It encompasses the UI controls,
// and connecting with the server. It does //not// handle registration or
// account management.

var debug = false;                    // display all alerts except debug_poll and debug_request
var debug_init = false;
var debug_trace = true;
var debug_login = false;
var debug_logout = false;
var debug_resume = true;
var debug_session = true;
var debug_storage = true;
var debug_friends = true;
var debug_chatbox = true;
var debug_send = true;
var debug_connection = true;
var debug_click = true;
var debug_scrollers = true;

var debug_poll = false;                // display poll alerts. not included in debug_trace or debug, so set this separately.
var debug_request = false;             // display ajax requests. not included in debug_trace or debug, so set this separately.

var debug_indent = '';

var myDebug = function(assert, msg, indent) {
    if (assert || debug) {
        if (indent == '-') {
            debug_indent = debug_indent.slice(2);
        }
        console.debug(debug_indent + msg);
        if (indent == '+') {
            debug_indent += '  ';
        }
    }
}

var AjaxIM = {};

(function($) {
    AjaxIM = function(options, actions) {   
        myDebug(debug_trace, 'AjaxIM('+options+', '+actions+') START', '+');
        var self = this;
        
        // === {{{ defaults }}} ===
        //
        // These are the available settings for Ajax IM, and the associated
        // defaults:
        //
        // * {{{pollType}}} determines the way in which the client will talk to
        // the server.
        // ** {{{comet}}} will use http streaming, wherein a connection to the server 
        // will be held open indefinitely, and the server will push down new events 
        // (messages, status updates) as they occur.
        // ** {{{long}}} will hold open a connection with the server for as long as 
        // possible, or until a new event is received. Upon the server sending an event 
        // or closing the connection, the client will automatically&mdash;and immediately&mdash;reconnect.
        // ** {{{short}}} will open a connection, and the server (if this method is
        // supported) will //immediately// provide a response as to whether or not 
        // there are any new events. Once a response is received, the client will 
        // wait 5 seconds, and then reconnect.
        // * {{{pollServer}}} is the default URL to which all actions refer. It is
        // possible to specify certain action URLs separately (as is used with the
        // NodeJS server).
        // * {{{cookieName}}} is the name of the session cookie used by the server.
        // If this is not set properly, the IM engine will not be able to automatically
        // reinitialize sessions.
        // * {{{theme}}} is the name of the theme folder that defines the HTML and
        // CSS of the IM bar and chat boxes. Usually, themes are deposited in the
        // provided "themes" folder and specified by that path, e.g. {{{themes/default}}}.
        // Theme files within the theme folder must be named {{{theme.html}}} and
        // {{{theme.css}}}.
        // * {{{storageMethod}}} defines the way in which data (chat sessions) are
        // temporarily stored client-side. By default, {{{"flash"}}} is used because
        // it is the most widely supported method. However,
        // [[http://eric.garside.name/docs.html?p=jstore#js-engines|other storage engines]]
        // are available, with their respective up- and down-sides
        // outlined, on the jStore website.
        // * {{{storeSession}}} (**not implemented**) sets the number of days to
        // retain stored chat session data before it should be deleted.
        // * {{{checkResume}}} is a flag that sets whether or not the client should
        // make a call to the server before resuming the session (such as on a page
        // reload). This will ensure that the session has not expired. If set to {{{false}}},
        // a call to the server will not be made, and the session will be assumed to
        // be active.
        var defaults = {
            pollType: 'long',
            pollServer: './ajaxim.php',
            cookieName: 'ajaxim_session',
            theme: 'themes/default',
            loadTheme: true,
            storageMethod: 'auto',
            flashStorage: 'js/jStore.Flash.html', // can be removed if we move html+swf file to ajax-im root
            storeSession: 5, // number of days to store chat data (0 for current session only)
            checkResume: false
        };
        
        // === {{{AjaxIM.}}}**{{{settings}}}** ===
        //
        // These are the settings for the IM. If particular options are not specified,
        // the defaults (see above) will be used.
        //These options will be defined upon calling the initialization function, and not set directly.
        this.settings = $.extend(defaults, options);
        
        // === {{{AjaxIM.}}}**{{{actions}}}** ===
        //
        // Each individual action that the IM engine can execute is predefined here.
        // By default, it merely appends the action onto the end of the {{{pollServer}}} url,
        // however, it is possible to define actions individually. //The alternative actions
        // will be defined upon calling the initialization function, and not set directly.
        //
        // Should you define an action at a different URL, Ajax IM will determine whether
        // or not this URL is within the current domain. If it is within a subdomain of
        // the current domain, it will set the document.domain variable for you,
        // to match a broader hostname scope; the action will continue to use {{{$.post}}}
        // (the default AJAX method for Ajax IM).
        //
        // On the other hand, should you choose a URL outside the current domain
        // Ajax IM will switch to {{{$.getJSON}}} (a get request) to avoid
        // cross-domain scripting issues. This means that a server on a different
        // port or at a different address will need to be able to handle GET
        // requests rather than POST requests (such as how the Node.JS Ajax IM
        // server works).
        this.actions = $.extend({
            login: this.settings.pollServer + '/login',
            logout: this.settings.pollServer + '/logout',
            register: this.settings.pollServer + '/register',
            poll: this.settings.pollServer + '/poll?method=' + this.settings.pollType,
            send: this.settings.pollServer + '/send',
            status: this.settings.pollServer + '/status',
            resume: this.settings.pollServer + '/resume'        // method not implemented !!! not sure what this is good for anyway, 
                                                                // as we read the cookie with javascript
        }, actions);
        
        var subdomainRx = new RegExp('((http[s]?:)?//)?.+[.]' + window.location.host, 'i'); // we could just test for '//.+[.]' + ...
        var samedomainRx = new RegExp('//' + window.location.host + '/', 'i');
        
        $.each(this.actions, function(name, action) {
            // maybe change logics later and move the poll branch to where indicated below
            action_array = ['ajax', action];
            if (name == 'poll') {
                if (! samedomainRx.test(action)) {
                    if (self.settings.pollType != 'comet') {
                        action += (/\?/.test(action) ? '&' : '?') + 'callback=?';
                    }
                    action_array = ['jsonp', action];
                }
            } else {
                if (subdomainRx.test(action)) {
                    myDebug(debug_init, 'subdomain in '+action);
                    document.domain = '.' + window.location.host;
                } else if (/^(http:)?\/\//i.test(action)) { // maybe drop this if
                    if (! samedomainRx.test(action)) {
                        myDebug(debug_init, 'crossdomain in '+action+', enable jsonp');
                        // if (name == 'poll' && self.settings.pollType != 'comet') {
                        action += (/\?/.test(action) ? '&' : '?') + 'callback=?';
                        // }
                        action_array = ['jsonp', action];
                    }
                } else {
                    myDebug(debug_init, 'same toplevel domain in '+action);
                }
            }
            self.actions[name] = action_array;
            myDebug(debug_init, 'self.actions['+name+']=['+action_array+']');
        });
        
        // Client-side storage for keeping track of conversation states, active tabs, etc.
        // The default is flash storage, however, other options are available via the jStore library.
        // ralf: not really :) first option comes first.
        // this is part one, which does not depend on dom ready
        if (self.settings.storageMethod)
        {
            myDebug(debug_storage, 'initilize storage');
            // get browser name to generate unique storage key
            // ### do we need this? one might think that different browsers run with
            // ### different build in storage engines, so there is no risk that they will collide.
            // ### maybe we need this for flash? yes, this makes sense.
            $.each($.browser, function(key, value) {
                if (key == 'version') {
                    return true;
                }
                if (value == true) {
                    self.storageBrowserKey = key;
                    return false;
                }
            });
            
            // determine the storage engine
            if (self.settings.storageMethod == 'auto') {
                storage_engines = ['local', 'html5', 'ie', 'flash'];
                $.each(storage_engines, function() {
                    if ($.jStore.Availability[ this ]()) {
                        self.settings.storageMethod = this;
                        myDebug(debug_storage, 'self.settings.storageMethod='+this);
                        return false;
                    }
                });
            }
            
            // jStore configuration
            $.extend($.jStore.defaults, {
                project: 'im.js',
                engine: self.settings.storageMethod,
                flash: self.settings.flashStorage
            });
        }
        
        $(document).ready(function()
        {
            myDebug(debug_trace, '$(document).ready() START', '+');
            // We load the theme dynamically based on the passed settings.
            // If the theme is set to false, we assume that the user is going to load it himself.
            self.themeLoaded = false;
            
            if (self.settings.loadTheme) {
                myDebug(debug_init, 'load bar');
                $('<div></div>').appendTo('body').load(self.settings.theme + '/theme.html #imjs-bar, .imjs-tooltip',
                    function() {
                        myDebug(debug_init, 'bar loaded');
                        self.themeLoaded = true;
                        //setup.apply(self);
                    }
                );
                if (typeof document.createStyleSheet == 'function') {
                    document.createStyleSheet(this.settings.theme + '/theme.css');
                } else {
                    $('head').append('<link rel="stylesheet" href="' + self.settings.theme + '/theme.css" />');
                }
            } else {
                myDebug(debug_init, 'theme has been added manually to page');
                self.themeLoaded = true;
                //setup.apply(self);
            }
            
            // ### probably not needed
            // allow all chatboxes to me minimized
            /*
            $('.imjs-chatbox').live('click', function(e) {
                e.preventDefault();
                return false;
            });
            */
            
            // toggle chatbox tab
            $('#imjs-bar .imjs-tab div.imjs-button').live('click', function() {
                myDebug(debug_click, 'click 1');
                self.toggleTab($(this).parents('.imjs-tab'));
            });
            
            // close link in chat tab
            $('#imjs-bar a.imjs-bar-close').live('click', function() {
                myDebug(debug_click, 'click 2');
                self.closeTab($(this).parents('.imjs-tab'));
            });
            
            // minimize link in chatbox head and friendsbox head
            $('#imjs-bar .imjs-tab .imjs-header div').live('click', function() {
                myDebug(debug_click, 'click 3');
                self.toggleTab($(this).parents('.imjs-tab'));
            });
            
            // close link in chatbox head
            $('#imjs-bar .imjs-chatbox .imjs-close').live('click', function() {
                myDebug(debug_click, 'click 4');
                self.closeTab($(this).parents('.imjs-tab'));
            });
            
            // minimize link in friends box head (handled by click 3)
            $('#imjs-friends .imjs-header').live('click', function() {
                myDebug(debug_click, 'click 5');
                self.toggleTab($('#imjs-friends'));
            });
            
            // create a chatbox when a buddylist item is clicked
            $('.imjs-friend').live('click', function() {
                myDebug(debug_click, 'click 6');
                // create new chatbox
                var chatbox = self._createChatbox($(this).data('friend'), false, true);
                var tab = chatbox.parents('.imjs-tab');
                // hide friends tab
                self.toggleTab($('#imjs-friends'));
                if (! tab.hasClass('imjs-maximized')) {
                    self.toggleTab(tab);
                }
                chatbox.find('.imjs-input').focus();
            });
            
            $('#imjs-friends')
                .removeClass('imjs-maximized').addClass('imjs-minimized')
                .click(function(e) {
                    if (!$(this).hasClass('imjs-not-connected') && e.target.id != 'imjs-friends-panel' && !$(e.target).parents('#imjs-friends-panel').length) {
                        myDebug(debug_click, 'click 7');
                        self.toggleTab($(this));
                    }
                })
                .mouseenter(function() {
                    if ($(this).hasClass('imjs-not-connected')) {
                        $('.imjs-tooltip').show();
                        $('.imjs-tooltip span').html(AjaxIM.i18n.notConnectedTip);
                        var tip_left = $(this).offset().left -
                            $('.imjs-tooltip').outerWidth() +
                            ($(this).outerWidth() / 2);
                        var tip_top = $(this).offset().top -
                            $('.imjs-tooltip').outerHeight(true);
                        $('.imjs-tooltip').css({
                            left: tip_left,
                            top: tip_top
                        });
                    }
                })
                .mouseleave(function() {
                    if ($(this).hasClass('imjs-not-connected')) {
                        $('.imjs-tooltip').hide();
                    }
                });
            
            $('#imjs-friends-panel').hide();
            
            // Setup message sending for all chatboxes
            // keydown/up needed for detecting ENTER, all sending handled with keydown
            // errors in javascript console are caused by jQuery. Using a non-jQuery handler hardwired with onclick
            // can solve this, but needs special integration efforts. Not sure if jQuery can be used in a normal js
            // event handler function, or all the code would need to be contained in the onkeydown attribute.
            // an example is contained in index.html, .live needs to be commented for this to work.
            // javascript errors are also thrown when using .bind instead of .live
            // as clearing the input is bound to keyup, the same message can be sent repeatedly by keeping ENTER pressed.
            // not sure if this is a desired feature.
            /*  
            // avoid height adjustment in firefox when starting to enter text
            $('.imjs-chatbox .imjs-input').each(function() { input_height = parseInt($(this).css('height')); });
            
            $('.imjs-chatbox .imjs-input').live('keydown', function(e) {
                if (e.which == 13 && !e.shiftKey) {
                var obj = $(this);
                    // if (!($.browser.msie && $.browser.version < 8)) {
                    //     myDebug(debug_click, 'send on keydown');
                    //     self.send(obj.parents('.imjs-chatbox').data('username'), obj.val());
                    // }
                    self.send(obj.parents('.imjs-chatbox').data('username'), obj.val());
                }
            }).live('keyup', function(e) {
                if (e.which == 13 && !e.shiftKey) {
                    // if ($.browser.msie && $.browser.version < 8) {
                    //    myDebug(debug_click, 'send on keyup');
                    //    var obj = $(this);
                    //    self.send(obj.parents('.imjs-chatbox').data('username'), obj.val());
                    // }
                    $(this).val('');
                    // obj.height(obj.data('height'));
                }
            }).live('keypress', function(e) {
                // resize height
                // var obj = $(this);
                // if (!($.browser.msie && $.browser.opera)) {
                //    obj.height(0);
                // }
                // if (this.scrollHeight > obj.height() || this.scrollHeight < obj.height()) {
                //    obj.height(this.scrollHeight);
                // }
                var obj = $(this);
                obj.height(input_height);
                if (this.scrollHeight != obj.height()) {
                    // IE8, Safari, Opera do not decrease height when text is deleted. if this cannot be solved, it might be
                    // better to used fixed height and scrollbars.
                    // myDebug(debug_click, this.scrollHeight+' '+obj.css('height'));
                    obj.height(this.scrollHeight);
                }
            });
            */
            
            $('.imjs-msglog').live('click', function() {
                myDebug(debug_click, 'click 8');
                var chatbox = $(this).parents('.imjs-chatbox');
                chatbox.find('.imjs-input').focus();
            });
            
            // setup and hide the scrollers
            $('.imjs-scroll').hide();
            
            $('#imjs-scroll-left').live('click', function() {
                myDebug(debug_click, 'click 9');
                var hiddenTab = $('#imjs-bar li.imjs-tab:visible')
                    .last()
                    .next('#imjs-bar li.imjs-tab:hidden')
                    .not('.imjs-closed')
                    .not('.imjs-default')
                    .last()
                    .show();
                    
                if (hiddenTab.length) {
                    $('#imjs-bar li.imjs-tab:visible').first().hide();
                    $('#imjs-scroll-left div').html(parseInt($('#imjs-scroll-left div').html()) - 1);
                    $('#imjs-scroll-right div').html(parseInt($('#imjs-scroll-right div').html()) + 1);
                    self.scrollLeft++;
                    $.jStore.store(self.storeKey + 'scrollLeft', self.scrollLeft.toString());
                    myDebug(debug_scrollers, self.storeKey + 'scrollLeft'+' '+self.scrollLeft);
                }
                return false;
            });
            
            $('#imjs-scroll-right').live('click', function() {
                myDebug(debug_click, 'click 10');
                var hiddenTab = $('#imjs-bar li.imjs-tab:visible')
                    .first()
                    .prev('#imjs-bar li.imjs-tab:hidden')
                    .not('.imjs-closed')
                    .not('.imjs-default')
                    .last()
                    .show();
                    
                if (hiddenTab.length) {
                    $('#imjs-bar li.imjs-tab:visible').last().hide();
                    $('#imjs-scroll-right div').html(parseInt($('#imjs-scroll-right div').html()) - 1);
                    $('#imjs-scroll-left div').html(parseInt($('#imjs-scroll-left div').html()) + 1);
                    self.scrollLeft--;
                    $.jStore.store(self.storeKey + 'scrollLeft', self.scrollLeft.toString());
                    myDebug(debug_scrollers, self.storeKey + 'scrollLeft'+' '+self.scrollLeft);
                }
                return false;
            });
            
            // part two of storage initialization
            // IE 6+7 and flash storage depend on the DOM being ready
            // we can optimize this by testing for local and HTML5 and initializing
            // these engines in part one, so before testing for DOM ready
            if (self.settings.storageMethod)
            {
                self.storageReady = false;
                
                // define callback functions for finishing jStore initialization
                $.jStore.ready(function(engine) {
                    engine.ready(function() {
                        myDebug(debug_trace || debug_storage, 'storage engine is ready, branch to setup()');
                        self.storageReady = true;
                        setup.call(self);
                    });
                });
                
                // initialize jStore
                // $.jStore.ready and the engine.ready are triggered when it's done and execute the above defined callback.
                // to be more precise $.jStore.load() calls $.jStore.use() which creates the engine object. use() checks then if
                // the engine is availabel by calling the method isAvailable(). isAvailable checks the technical preconditions
                // for the engine aka if the browser supports this engine. If this check is positive, the event 
                // jStore-ready is triggered and the callback which has been set with $.jStore.ready(function(engine)) is executed.
                // We still do not know if the engine is ready, and this could take some additional time, especially if
                // flash storage is used and flash needs to be installed. If the engine is ready, the event engine-ready is triggered
                // and engine.ready(function) is executed. We can now continue with setting up the chat toolbar.
                // This all sounds too complicated. Probably we could get rid of the first ready test. I mean: we already selected
                // the right storage engine depending on the browser, so why test it again ???
                // flash storage in opera < 10.5 took seconds to initialze. It might be a good idea to add cookie storage to the
                // possible options. Data could also be stored with ajax in the session, but I think cookie storage is sufficient.
                // Last but not least, we could implement a fallback option for not using local storage at all
                // (paranoid security option)
                
                $.jStore.load();
            }
            else
            {
                this.storageReady = true;
                setup.call(this);
            }
            myDebug(debug_trace, '$(document).ready() END', '-');
        });
        myDebug(debug_trace, 'AjaxIM('+options+', '+actions+') END', '-');
    };
    // END OF CONSTRUCTOR
    
    // We predefine all public functions here...
    // If they are called before everything (theme, storage engine) has loaded,
    // then they get put into a "prequeue" and run when everything *does*
    // finally load.
    //
    // This ensures that nothing loads without all of the principal components
    // being pre-loaded. If that were to occur (without this prequeue), things
    // would surely break.
    // ### seems that only login and form needs to be delayed, so an event delegate might also do
    // ### as we use a singleton to create the chat object, we could also rely on class variables
    
    // === {{{AjaxIM.}}}**{{{statuses}}}** ===
    //
    // These are the available status codes and their associated identities:
    // * {{{offline}}} (0) &mdash; Only used when signing out/when another
    // user has signed out, as once this status is set, the user is removed
    // from the server and friends will be unable to contact the user.
    // * {{{available}}} (1) &mdash; The user is online and ready to be messaged.
    // * {{{away}}} (2) &mdash; The user is online but is not available. Others
    // may still contact this user, however, the user may not respond. Anyone
    // contacting an away user will receive a notice stating that the user is away,
    // and (if one is set) their custom status message.
    // * {{{invisible}}} (3; **not yet implemented**) &mdash; The user is online,
    // but other users are made unaware, and the user will be represented
    // as being offline. It is still possible to contact this user, and for this
    // user to contact others; no status message or notice will be sent to others
    // messaging this user.
    
    // ### using an array for statuses might simplify things
    
    $.extend(AjaxIM.prototype, {
        settings: {},
        statuses: {offline: 0, available: 1, away: 2, invisible: 3},
        status: 0,
        username: '',
        storeKey: '',
        storageBrowserKey: 'unknown',
        scrollLeft: 0,
        prequeue: [],
        
        // friends and chats need to be json for storage, so we cannot use arrays
        friends: {},
        chatlist: {},
        chatstore: {},
        
        // ### bar Object has been integrated with AjaxIM. Easier to handle, and it is not
        // ### really needed to define a bar Object. old bar.initialize has been completely
        // ### integrated with setup(), which again makes things easier.
        // ### it seems we need to enqueue only those methods which are public
        
        login: function() { this.prequeue.push(['login', arguments]); },
        logout: function() { this.prequeue.push(['logout', arguments]); },
        form: function() { this.prequeue.push(['form', arguments]); },
        resume: function() { this.prequeue.push(['resume', arguments]); },
        poll: function() { this.prequeue.push(['poll', arguments]); },
        send: function() { this.prequeue.push(['send', arguments]); },
        status: function() { this.prequeue.push(['status', arguments]); },
        addTab: function() { this.prequeue.push(['addTab', arguments]); },
        toggleTab: function() { this.prequeue.push(['toggleTab', arguments]); },
        closeTab: function() { this.prequeue.push(['closeTab', arguments]); },
        _notification: function() { this.prequeue.push(['_notification', arguments]); },
        _incoming: function() { this.prequeue.push(['_incoming', arguments]); },
        _scrollers: function() { this.prequeue.push(['_scrollers', arguments]); }
    });
    
    setup = function()
    {
        myDebug(debug_trace, 'setup() START', '+');
        if (!this.storageReady || !this.themeLoaded) {
            myDebug(debug_trace, 'not ready!!! storageReady='+this.storageReady+' themeLoaded='+this.themeLoaded);
            return;
        }
        
        var self = this;
        
        myDebug(debug_trace, 'storageReady and themeLoaded');
        $(self).trigger('loadComplete');
        
        // redefine the prototype methods, now that we know that DOM and storage engine are ready
        //
        
        // == Main ==
        
        // === {{{AjaxIM.}}}**{{{login(username, password)}}}** ===
        //
        // Authenticates a user and initializes the IM engine. If the user is
        // already logged in, [s]he is logged out, the session is cleared, and
        // the new user is logged in.
        //
        // Returns the user's properly formatted username, session ID, and online
        // friends in JSON, if successful; e.g.:\\
        // {{{ {u: 'username', s: 'longsessionid', f: [{u: 'friend', s: 1, g: 'group'}]} }}}
        //
        // If unsuccessful, {{{false}}} is returned.
        //
        // ==== Parameters ====
        // * {{{username}}} is the user's username.\\
        // * {{{password}}} is the user's password. This password will be MD5 hashed
        // before it is sent to the server.
        
        $.extend(AjaxIM.prototype,
        {
            login: function(username, password) {
                if (!username) username = '';
                if (!password) password = '';
                myDebug(debug_trace || debug_login, 'login('+username+', '+password+') START', '+');
                
                /*
                if (this.username) {
                    myDebug(debug_login, 'this.username already set from session cookie');
                    return true; // Already logged in!
                    ### WE CANNOT REALLY KNOW THIS. USER COULD HAVE LEFT WITHOUT SIGNING OUT AND THEN THE SESSION COOKIE IS STILL AROUND.
                    ### THE LOGIN FUNCTION NEEDS TO CHECK THE SESSION
                }
                */
                
                // initialize session
                self._clearSession();
                // hash password before sending it to the server
                password_md5 = $.md5(password);
                
                myDebug(debug_login, 'action='+this.actions.login);
                // authenticate
                AjaxIM.request(
                    this.actions.login,
                    {'username': username, 'password': password_md5},
                    function(response) {
                        myDebug(debug_trace || debug_login, 'login callback START', '+');
                        myDebug(debug_login, 'response='+response.r);
                        if (response.r == 'resume') {
                            myDebug(debug_login, 'login callback END', '-');
                            return true;
                        } else if (response.r == 'logged in') {
                            // set username
                            self.username = ('u' in response ? response.u: username);
                            myDebug(debug_login, 'self.username='+self.username);
                            // set storeKey
                            if (self.settings.storageMethod) {
                                self.storeKey = [self.storageBrowserKey, self.username, ''].join('-');
                                myDebug(debug_login, 'self.storeKey='+self.storeKey);
                            }
                            // set user status
                            self.status = response.s;
                            myDebug(debug_login, 'self.status='+self.status);
                            // read and store friends
                            $.each(response.f, function() {
                                myDebug(debug_login || debug_friends, 'self.friends['+this.u+']={status:'+this.s+', message:'+this.m+', group:'+this.g+'}');
                                self.friends[this.u] = {status: this.s, message: this.m, group: this.g};
                            });
                            self._storeFriends();
                            // start session
                            self._startSession();
                            
                            $(self).trigger('loginSuccessful', [response]);
                            
                            myDebug(debug_trace || debug_login, 'login callback END', '-');
                            return response;
                        } else {
                            myDebug(debug_login, 'login error');
                            $(self).trigger('loginError', [response]);
                        }
                        
                        myDebug(debug_login, 'login callback END', '-');
                        return false;
                    }
                );
                myDebug(debug_trace || debug_login, 'login('+username+', '+password+') END', '-');
            },
            // END OF login
            
            
            // === {{{AjaxIM.}}}**{{{logout()}}}** ===
            //
            // Logs the user out and removes his/her session cookie. As well, it
            // will close all existing chat windows, clear the storage engine, and
            // remove the IM bar.
            
            logout: function() {
                myDebug(debug_trace || debug_logout, 'logout() START', '+');
                myDebug(debug_logout, 'action='+this.actions.logout);
                AjaxIM.request(
                    this.actions.logout,
                    {},
                    function(response) {
                        myDebug(debug_logout, 'callback logout START', '+');
                        if (response) {
                            myDebug(debug_logout, 'logout success');
                            self.cookies.erase(self.settings.cookieName);
                            self._clearSession();
                            $(self).trigger('logoutSuccessful');
                            myDebug(debug_logout, 'callback logout END', '-');
                            return true;
                        } else {
                            myDebug(debug_logout, 'logout error');
                            $(self).trigger('logoutError');
                            myDebug(debug_logout, 'callback logout END', '-');
                            return false;
                        }
                    }
                );
                myDebug(debug_trace || debug_logout, 'logout() END', '-');
            },
            // END OF logout
            
            
            // === {{{AjaxIM.}}}**{{{resume()}}}** ===
            //
            // Resumes an existing session based on a session ID stored in the
            // server-set cookie. This function is called //automatically// upon IM
            // engine (re-)initialization, so the user does not need to re-login
            // should a session already exist.
            
            resume: function() {
                myDebug(debug_trace || debug_resume, 'resume() START', '+');
                myDebug(debug_resume, 'self.settings.cookieName is '+self.settings.cookieName);
                var session_cookie = self.cookies.get(self.settings.cookieName);
                
                myDebug(debug_resume, 'session_cookie='+session_cookie);
                if (session_cookie) myDebug(debug_resume, 'session_cookie.sid is '+session_cookie.sid);
                if (session_cookie && session_cookie.sid) {
                    myDebug(debug_resume, 'session found');
                    // set username
                    myDebug(debug_resume, 'session_cookie.username is '+session_cookie.user);
                    self.username = session_cookie.user;
                    myDebug(debug_resume, 'self.username='+self.username);
                    // set storage key
                    this.storeKey = [this.storageBrowserKey, this.username, ''].join('-');
                    myDebug(debug_resume || debug_storage, 'storeKey='+this.storeKey);
                    // check if server session is still alive
                    myDebug(debug_resume, 'self.settings.checkResume is '+self.settings.checkResume);
                    if (self.settings.checkResume) {
                        myDebug(debug_resume, 'action='+this.actions.resume);
                        AjaxIM.request(
                            this.actions.resume,
                            {},
                            function(response) {
                                myDebug(debug_resume, 'callback resume START', '+');
                                myDebug(debug_resume, 'response.r='+response.r);
                                if (response.r == 'connected') {
                                    myDebug(debug_resume, 'resume success');
                                    self._resumeSession();
                                    self._startSession();
                                    self._scrollers();
                                    var resumeScrollLeft = self.scrollLeft = $.jStore.store(self.storeKey + 'scrollLeft') || 0;
                                    myDebug(debug_resume || debug_storage, 'self.scrollLeft set from storage '+self.storeKey+'scrollLeft='+self.scrollLeft);
                                    for (i = 1; i <= resumeScrollLeft; i++) {
                                        $('#imjs-scroll-left').click();
                                        myDebug(debug_resume, 'scroll left button has been clicked');
                                    }
                                    self.scrollLeft = resumeScrollLeft;
                                    $.jStore.store(self.storeKey + 'scrollLeft', self.scrollLeft)
                                    myDebug(debug_resume || debug_storage, 'write storage '+self.storeKey+'scrollLeft='+self.scrollLeft);
                                } else {
                                    myDebug(debug_resume, 'resume failure');
                                    var username = this.username;
                                    self._clearSession();
                                    $(self).trigger('sessionNotResumed', [username]);
                                }
                                myDebug(debug_resume, 'callback resume END', '-');
                            }
                        );
                    } else {
                        myDebug(debug_resume, 'self.settings.checkResume == false => no AJAX request is sent to check session');
                        self._resumeSession();
                        self._startSession();
                        self._scrollers();
                        var resumeScrollLeft = self.scrollLeft = $.jStore.store(self.storeKey + 'scrollLeft') || 0;
                        myDebug(debug_resume || debug_storage, 'self.scrollLeft set from storage '+self.storeKey+'scrollLeft='+self.scrollLeft);
                        for (i = 1; i <= resumeScrollLeft; i++) {
                            $('#imjs-scroll-left').click();
                            myDebug(debug_resume, 'scroll left button has been clicked');
                        }
                        self.scrollLeft = resumeScrollLeft;
                        $.jStore.store(self.storeKey + 'scrollLeft', self.scrollLeft)
                        myDebug(debug_resume || debug_storage, 'write storage '+self.storeKey+'scrollLeft='+self.scrollLeft);
                    }
                } else {
                    myDebug(debug_resume, 'no session cookie found');
                    $(self).trigger('noSession');
                }
                myDebug(debug_trace || debug_resume, 'resume END', '-');
            },
            // END OF resume
            
            
            // === //private// {{{AjaxIM.}}}**{{{_clearSession()}}}** ===
            //
            // Remove all session data from last known user
            
            _clearSession: function() {
                myDebug(debug_trace || debug_session, '_clearSession() START', '+');
                
                try {
                    $.jStore.remove(self.storeKey + 'friends');
                    myDebug(debug_storage || debug_session, 'friends removed from storage');
                } catch(e) {
                    myDebug(true, 'ERROR on removing friends from storage');
                }
                
                try {
                    $.jStore.remove(self.storeKey + 'chatstore');
                    myDebug(debug_storage || debug_session, 'chatstore removed from storage');
                } catch(e) {
                    myDebug(true, 'ERROR on removing chatstore from storage');
                }
                
                try {
                    $.jStore.remove(self.storeKey + 'chatlist');
                    myDebug(debug_storage || debug_session, 'chatlist removed from storage');
                } catch(e) {
                    myDebug(true, 'ERROR on removing chatlist from storage');
                }
                
                try {
                    $.jStore.remove(self.storeKey + 'scrollLeft');
                    myDebug(debug_storage || debug_session, 'scrollLeft removed from storage');
                } catch(e) {
                    myDebug(true, 'ERROR on removing scrollLeft from storage');
                }
                
                // ### replaced by multiple selected tabs in chatlist
                // ### try { $.jStore.remove(self.storeKey + 'activeTab'); } catch(e) {}
                // ### self.activeTab = '';
                
                self.friends = {};
                self.chatstore = {};
                self.chatlist = {};
                self.username = '';
                self.storeKey = '';
                self.status = 0;
                self.scrollLeft = 0;
                myDebug(debug_session, 'self.friends = {}; self.chatstore = {}; self.chatlist = {};');
                myDebug(debug_session, "self.username = ''; self.storeKey = ''; self.status = 0; self.scrollLeft = 0;");
                
                $('.imjs-tab').not('.imjs-tab.imjs-default').remove();
                myDebug(debug_session, 'chat tabs removed');
                
                $('li .imjs-friend-group').not('.imjs-default').remove();
                myDebug(debug_session, 'friends panel friends removed');
                
                $('#imjs-friends-panel .imjs-header span').html('');
                myDebug(debug_session, 'friends panel header removed');
                
                $('#imjs-friends-panel').hide();
                myDebug(debug_session, 'friends panel hidden');
                
                $('#imjs-friends').removeClass('imjs-maximized imjs-minimized imjs-selected').addClass('imjs-not-connected');
                myDebug(debug_session, 'friends tab class set to "imjs-not-connected"');
                
                $('.imjs-scroll').hide();
                myDebug(debug_session, 'scrollers hidden');
                
                self.cookies.erase('ajaxim_session');
                myDebug(debug_session, 'ajaxim_session cookie deleted');
                
                myDebug(debug_trace || debug_session, '_clearSession() END', '-');
            },
            // END OF _clearSession
            
            
             // === // private // {{{AjaxIM.}}}**{{{_resumeSession()}}}** ===
            //
            // Retrieves chat session data from whatever storage engine is enabled
            // (provided that one is enabled at all). If a page reloads, this function
            // is called to restore the user's chat state (existing conversations, active tab).
            // This function is called //automatically//, upon initialization of the IM engine.
            
            _resumeSession: function() {
                myDebug(debug_trace || debug_session, '_resumeSession() START', '+');
                if (! this.storeKey.length) {
                    myDebug(debug_session || debug_storage, 'this.storeKey is empty => return');
                    return;
                }
                
                // restore friends from storage
                try {
                    this.friends = $.jStore.store(this.storeKey + 'friends');
                    myDebug(debug_session || debug_storage, 'loaded from storage: this.friends = '+this.storeKey+'friends = '+self._friendsPrint(self.friends));
                    // additional test
                    var check = false;
                    if (typeof this.friends == 'object') {
                        for (x in this.friends) { check = true; break; }
                    }
                    if (! check) {
                        myDebug(true, 'undefined friends: set this.friends = {}');
                        this.friends = {};
                    }
                } catch(e) {
                    myDebug(true, 'ERROR reading friends from storage. set this.friends = {};');
                    this.friends = {};
                }
                
                // restore chatlist from storage
                try {
                    this.chatlist = $.jStore.store(this.storeKey + 'chatlist');
                    myDebug(debug_session || debug_storage, 'loaded from storage: this.chatlist = '+this.storeKey+'chatlist = '+this._chatlistPrint(this.chatlist));
                    // additional test
                    var check = false;
                    if (typeof this.chatlist == 'object') {
                        for (x in this.chatlist) { check = true; break; }
                    }
                    if (! check) {
                        myDebug(true, 'undefined chatlist: set this.chatlist = {}');
                        this.chatlist = {};
                    }
                } catch(e) {
                    myDebug(true, 'ERROR reading chatlist from storage: set this.chatlist = {}');
                    this.chatlist = {};
                }
                
                // restore chatstore from storage
                try {
                    this.chatstore = $.jStore.store(this.storeKey + 'chatstore');
                    myDebug(debug_session || debug_storage, 'loaded from storage: this.chatstore = '+this.storeKey+'chatstore = '+this._chatstorePrint(this.chatstore));
                    // additional test
                    check = false;
                    if (typeof this.chatstore == 'object') {
                        for (x in this.chatstore) { check = true; break; }
                    }
                    if (! check) {
                        myDebug(true, 'undefined chatstore: set this.chatstore = {}');
                        this.chatstore = {};
                    }
                } catch(e) {
                    myDebug(true, 'error reading chatstore from storage, try to remove chats from storage');
                    try {
                        $.jStore.remove(this.storeKey + 'chatstore');
                        myDebug(true, 'store key '+this.storeKey + 'chatstore removed successfully from storage');
                    } catch(e) {}
                    myDebug(true, 'set this.chatstore = {}');
                    this.chatstore = {};
                }
                
                // restore chatboxes and check selection of friends tab
                myDebug(debug_session || debug_storage, 'restore chatboxes from this.chatlist');
                $.each(self.chatlist, function(username, chat) {
                    if (username == '#friends#') {
                        if (chat.sel) {
                            self.toggleTab($('#imjs-friends'));
                            myDebug(debug_session, 'friends tab selected');
                        }
                    } else {
                        myDebug(debug_session || debug_storage, 'restore username='+username);
                        var chatbox = self._createChatbox(username, true, chat.sel);
                        var tab = chatbox.parents('.imjs-tab');
                        if (tab.hasClass('imjs-selected')) {
                            self.toggleTab(tab);
                            var msglog = tab.find('.imjs-msglog');
                            msglog[0].scrollTop = msglog[0].scrollHeight;
                            myDebug(debug_session, 'active chat displayed successfully');
                        }
                        $(self).trigger('chatRestored', [username, chatbox]);
                    }
                });
                myDebug(debug_trace || debug_session, '_resumeSession() END', '-');
            },
            // END OF _resumeSession
            
            
            // === //private// {{{AjaxIM.}}}**{{{_startSession(friends)}}}** ===
            //
            // Prepares the chat bar and begins polling the server.
            // Called by {{{AjaxIM.resume()}}} and  {{{AjaxIM.login()}}}.
            //
            
            _startSession: function() {
                myDebug(debug_trace || debug_session, '_startSession() START', '+');
                // init bar
                $('#imjs-friends-panel .imjs-header div').html(self.username);
                $('#imjs-friends').removeClass('imjs-not-connected');
                
                // add friends to list
                $.each(self.friends, function(username, f) {
                    self._addFriend(username, f.status, f.message, f.group);
                });
                self._updateFriendCount();
                
                // remove border from first group header
                $('.imjs-friend-group').not('.imjs-default').find('.imjs-friend-group-header').first().css('border-top', 'none');
                
                $(self).trigger('sessionResumed', [self.username]);
                
                // start polling
                myDebug(debug_poll || debug_session, 'start polling');
                setTimeout(function() { self.poll(); }, INTERVAL);
                myDebug(debug_trace || debug_session, '_startSession() END', '-');
            },
            // END OF _startSession
            
            
            // === {{{AjaxIM.}}}**{{{_addFriend(username, group)}}}** ===
            //
            // Inserts a new friend into the friends list. If the group specified
            // doesn't exist, it is created. If the friend is already in this group,
            // they aren't added again. The friend item is returned.
            //
            // ==== Parameters ====
            // * {{{username}}} is the username of the new friend.
            // * {{{status}}} is the current status of the friend.
            // * {{{group}}} is the user group to which the friend should be added.
            
            _addFriend: function(username, status, message, group) {
                myDebug(debug_trace || debug_friends, '_addFriend('+username+','+status+','+message+','+group+') START', '+');
                // get status key
                var status_name = 'available';
                $.each(self.statuses, function(key, s) {
                    if (s == status) {
                        status_name = key;
                        return false;
                    }
                });
                
                var group_id = 'imjs-group-' + $.md5(group);
                var group_item = $('#' + group_id)
                
                // add group
                if (! group_item.length) {
                    group_item = $('.imjs-friend-group.imjs-default').clone()
                        .removeClass('imjs-default')
                        .attr('id', group_id)
                        .data('group', group)
                        .appendTo('#imjs-friends-list');
                    
                    var group_header = group_item.find('.imjs-friend-group-header');
                    group_header.html(group_header.html().replace('{group}', group));
                    myDebug(debug_friends, 'group '+group+' added to friends tab');
                }
                
                var friend_id = 'imjs-friend-' + $.md5(username + group);
                var friend_item = $('#' + friend_id);
                
                // add friend
                if (! friend_item.length) {
                    friend_item = group_item.find('ul li.imjs-default').clone()
                        .removeClass('imjs-default')
                        .addClass('imjs-' + status_name)
                        .attr('id', friend_id)
                        .data('friend', username)
                        .appendTo(group_item.find('ul'));
                    // ### not sure if this is needed. login returns only users with status <> 0 AND status <> 3
                    // ### there is a parameter "offline" which can be se to true, and the offline friends are returned
                    // ### but in this case, we might expect to see the offline friends
                    if (status == 0) friend_item.hide();
                    friend_item.html(friend_item.html().replace('{username}', username));
                    myDebug(debug_friends, 'friend '+username+' added to friends tab');
                }
                myDebug(debug_trace || debug_friends, '_addFriend('+username+','+status+','+message+','+group+') END', '-');
                return self.friends[username];
            },
            // END OF _addFriend
            
            
            // === //private// {{{AjaxIM.}}}**{{{_friendUpdate(friend, status, statusMessage)}}}** ===
            //
            // Called when a friend's status is updated. This function will update all locations
            // where a status icon is displayed (chat tab, friends list), as well as insert
            // a notification, should a chatbox be open.
            //
            // ==== Parameters ====
            // * {{{friend}}} is the username of the friend.
            // * {{{status}}} is the new status code. See {{{AjaxIM.statuses}}}  a list of available
            // codes. //Note: If an invalid status is specified, no action will be taken.//
            // * {{{statusMessage}}} is a message that was, optionally, specified by the user. It will be
            // used should "you" send the user an IM while they are away, or if their status is viewed
            // in another way (such as via the friends list [**not yet implemented**]).
            
            _friendUpdate: function(friend, status, statusMessage) {
                // add friend to buddylist, update their status, etc.
                myDebug(debug_trace || debug_friends, '_friendUpdate('+friend+','+status+','+statusMessage+') START', '+');
                // ### using an array can simplify this
                // get status_name
                var status_name = 'available';
                
                $.each(self.statuses, function(key, s) {
                    if (s == status) {
                        status_name = key;
                        return false;
                    }
                });
                
                // update status in tab
                if (self.chatlist[friend]) {
                    var tab = $('#'+self.chatlist[friend].id).parents('.imjs-tab');
                    
                    tab.addClass('imjs-tab imjs-'+status_name);
                    if (tab.hasClass('imjs-maximized')) {
                        tab.addClass('imjs-selected');
                    }
                    
                    // display the status in the chatbox
                    var date_stamp = $('.imjs-tab.imjs-default .imjs-chatbox .imjs-msglog .imjs-date').clone();
                    
                    var date_stamp_time = date_stamp.find('.imjs-msg-time');
                    
                    if (date_stamp_time.length) {
                        date_stamp_time.html(AjaxIM.dateFormat(date_stamp_time.html()));
                    }
                    
                    var date_stamp_date = date_stamp.find('.imjs-date-date').html(
                        AjaxIM.i18n[
                            'chat' + status_name[0].toUpperCase() + status_name.slice(1)
                        ].replace(/%s/g, friend));
                    
                    var msglog = $('#'+self.chatlist[friend].id).find('.imjs-msglog');
                    date_stamp.appendTo(msglog);
                    msglog[0].scrollTop = msglog[0].scrollHeight;
                }
                
                if (self.friends[friend]) {
                    var friend_id = 'imjs-friend-' + $.md5(friend + self.friends[friend].group);
                    $('#' + friend_id).attr('class', 'imjs-friend imjs-' + status_name);
                    
                    if (status == 0) {
                        $('#' + friend_id + ':visible').slideUp();
                        $('#' + friend_id + ':hidden').hide();
                    } else if (!$('#' + friend_id + ':visible').length) {
                        $('#' + friend_id).slideDown();
                    }
                    
                    self.friends[friend].status = [status, statusMessage];
                    self._updateFriendCount();
                }
                myDebug(debug_trace || debug_friends, '_friendUpdate('+friend+','+status+','+statusMessage+') END', '-');
            },
            // END OF _friendUpdate
            
            
            // === //private// {{{AjaxIM.}}}**{{{_updateFriendCount()}}}** ===
            //
            // Counts the number of online friends and updates the friends count
            // in the friend tab.
            
            _updateFriendCount: function() {
                myDebug(debug_trace || debug_friends, '_updateFriendCount() START', '+');
                var friendsCount = 0;
                $.each(self.friends, function() {
                    if (this.status != 0) {
                        friendsCount++;
                    }
                });
                myDebug(debug_friends, 'friendCount='+friendsCount);
                $('#imjs-friends span.imjs-count span').html(friendsCount);
                myDebug(debug_friends, 'friends tab friends count updated');
                myDebug(debug_trace || debug_friends, '_updateFriendCount() END', '-');
            },
            // END OF _updateFriendCount
            
            
            // === //private// {{{AjaxIM.}}}**{{{_storeFriends()}}}** ===
            //
            // If a storage method is enabled, the current state of the
            // user's friends list is stored.
            
            _storeFriends: function() {
                myDebug(debug_trace || debug_friends, '_storeFriends() START', '+');
                if (this.settings.storageMethod && this.storageReady) {
                    try {
                        myDebug(debug_storage || debug_friends, 'store '+this.storeKey+'friends='+this._friendsPrint(this.friends));
                        $.jStore.store(this.storeKey + 'friends', this.friends);
                    }
                    catch(e) {}
                }
                myDebug(debug_trace || debug_friends, '_storeFriends() END', '-');
            },
            // END OF _storeFriend
            
            
            // === //private// {{{AjaxIM.}}}**{{{_createChatbox(username)}}}** ===
            //
            // Builds a chatbox based on the default chatbox HTML and CSS defined
            // in the current theme. Should a chatbox for this user already exist,
            // a new one is not created. Instead, it is either given focus (should
            // no other windows already have focus), or a notification is issued.
            //
            // As well, if the chatbox does not exist, an associated tab will be
            // created.
            //
            // ==== Parameters ====
            // * {{{username}}} is the name of the user for whom the chatbox is intended
            // for.
            // * {{{resume}}} sets whether or not to add a date stamp to the chatbox
            // upon creation.
            // * {{{selected}}} sets whether or not the chatbox should be selected.
            // Chatboxes which are created by incoming messages set this parameter
            // to false. Chatboxes created by the user set this to true. Chatboxes
            // created by resume set this to the corresponding value of the
            // chatlist in storage.
            //
            // //Note:// New chatboxes are given an automatically generated ID in the
            // format of {{{#imjs-[md5 of username]}}}.
            
            _createChatbox: function(username, resume, selected) {
                myDebug(debug_trace, '_createChatbox('+username+','+resume+','+selected+') START', '+');
                var tab = $('#imjs-tab-' + $.md5(username));
                
                if (! tab.length) {
                    // add a tab
                    tab = self.addTab(username, resume, selected);
                    var chatbox = tab.find('.imjs-chatbox');
                    // check if we need scrolling now. resume does this only once it's callback function.
                    if (! resume) {
                        self._scrollers();
                        self.scrollLeft = 0;
                        $.jStore.store(self.storeKey + 'scrollLeft', self.scrollLeft.toString());
                        myDebug(debug_storage, 'store '+self.storeKey+'scrollLeft='+self.scrollLeft.toString());
                    }
                    // store inputbox height
                    // var input = chatbox.find('.imjs-input');
                    // input.data('height', input.height());
                } else if (tab.hasClass('imjs-closed')) {
                    myDebug(debug_chatbox, 'chatbox was closed');
                    var chatbox = tab.find('.imjs-chatbox');
                    // mark old messages
                    chatbox.find('.imjs-msglog > *').addClass('imjs-msg-old');
                    myDebug(debug_chatbox, 'old messages marked');
                    // prepare tab
                    tab.removeClass('imjs-closed imjs-selected').insertAfter('#imjs-scroll-right');
                    myDebug(debug_chatbox, 'tab made visible');
                    // possibly add a date stamp
                    if (! resume) {
                        var time = this._addDateStamp(chatbox);
                    }
                    // update and store chatlist
                    self.chatlist[username] = {id: chatbox.attr('id'), sel: true };
                    try {
                        $.jStore.store(self.storeKey + 'chatlist', self.chatlist);
                        myDebug(debug_storage, 'store '+self.storeKey+'chatlist='+self._chatlistPrint(self.chatlist));
                    }
                    catch(e) {
                        myDebug(true, 'ERROR on store '+self.storeKey+'chatlist='+self._chatlistPrint(self.chatlist));
                    }
                    // display notification if tab is created by incoming message
                    if (! selected) {
                        self._notification(tab);
                    }
                    // check if we need scrolling now. resume does this only once in it's callback function.
                    if (! resume) {
                        self._scrollers();
                        self.scrollLeft = 0;
                        $.jStore.store(self.storeKey + 'scrollLeft', self.scrollLeft.toString());
                        myDebug(debug_storage, 'store '+self.storeKey+'scrollLeft='+self.scrollLeft.toString());
                    }
                } else {
                    // chatbox is already visible
                    chatbox = tab.find('.imjs-chatbox');
                }
                myDebug(debug_trace, '_createChatbox('+username+','+resume+','+selected+') END', '-');
                return chatbox;
            },
            // END OF _createChatbox
            
            
            // === {{{AjaxIM.}}}**{{{addTab(username, resume, display, selected, action, closable)}}}** ===
            //
            // Adds a tab to the tab bar, with the label {{{label}}}. When
            // clicked, it will call a callback function, {{{action}}}. If
            // {{{action}}} is a string, it is assumed that the string is
            // referring to a chatbox ID.
            //
            // ==== Parameters ====
            // * {{{username}}} is the text that will be displayed on the tab.\\
            // * {{{resume}}}   if we add a tab from resume, we won't create a new datestamp
            //                  and do not need to store the chatlist
            // * {{{selected}}} if we resume, a tab might be selected or not
            // * {{{action}}}   is the callback function, if it is a non-chatbox tab
            // * {{{closable}}} is a boolean value that determines whether or not
            //                  it is possible for a user to close this tab.
            //
            // //Note:// New tabs are given an automatically generated ID
            // in the format of {{{#imjs-tab-[md5 of label]}}}.
            
            addTab: function(username, resume, selected, action, closable) {
                myDebug(debug_trace, 'addTab('+username+','+resume+','+selected+','+action+','+closable+') START', '+');
                var hash = $.md5(username);
                var tab_id = 'imjs-tab-' + hash;
                var chatbox_id = 'imjs-' + hash;
                
                // initialize tab
                var tab = $('.imjs-tab.imjs-default').clone().hide().insertAfter('#imjs-scroll-right');
                
                tab.removeClass('imjs-default')
                    .attr('id', tab_id)
                    .html(tab.html().replace('{label}', username));
                
                // online status
                if (username in self.friends) {
                    var status_name = 'available';
                    $.each(self.statuses, function(key, s) {
                        if (s == self.friends[username].status) {
                            status_name = key;
                            return false;
                        }
                    });
                    tab.addClass('imjs-' + status_name);
                }
                
                // initialize chatbox
                var chatbox = tab.find('.imjs-chatbox');
                
                chatbox.attr('id', chatbox_id);
                
                // remove default items from the message log
                chatbox.find('.imjs-msglog').empty();
                
                // associate the username with the object
                chatbox.data('username', username);
                
                // initialize chatbox header
                var header = chatbox.find('.imjs-header');
                header.html(header.html().replace('{username}', username));
                
                // add a date stamp
                if (! resume) {
                    self._addDateStamp(chatbox);
                } else {
                    // Remove the automatic date stamp
                    chatbox.find('.imjs-msglog').empty();
                    convo = self.chatstore[username];
                    if (convo.length) {
                        // check if this chatbox is selected
                        // Restore all messages, date stamps, and errors
                        $.each(convo, function() {
                            switch (this[0]) {
                                case 'error':
                                    myDebug(debug_storage, 'add error');
                                    self._addError(chatbox, decodeURIComponent(this[2]), this[3]);
                                break;
                                
                                case 'datestamp':
                                    myDebug(debug_storage, 'add datestamp');
                                    self._addDateStamp(chatbox, this[3]);
                                break;
                                
                                case 'a':
                                case 'b':
                                    myDebug(debug_storage, 'add message');
                                    self._addMessage(this[0], chatbox, this[1], decodeURIComponent(this[2]), this[3]);
                                break;
                            }
                        });
                    } else {
                        myDebug(debug_storage, 'username='+username+' convo.length==0');
                    }
                }
                
                // initialize notification
                var notification = tab.find('.imjs-notification');
                notification.data('count', 0).data('default-text', notification.html());
                notification.html(notification.html().replace('{count}', '0'));
                notification.hide();
                
                // special options
                if (closable === false) {
                    tab.find('.imjs-close').first().remove();
                }
                
                // hide chatbox and tab depending on resume
                chatbox.hide();
                tab.addClass('imjs-minimized').show();
                if (selected) {
                    tab.addClass('imjs-selected');
                }
                if (! resume) {
                    // update chatlist
                    $.each(self.chatlist, function() {
                        this.sel = false;
                    });
                    self.chatlist[username] = {id: chatbox_id, sel: selected };
                    try {
                        $.jStore.store(self.storeKey + 'chatlist', self.chatlist);
                        myDebug(debug_storage, 'store '+self.storeKey+'chatlist='+self._chatlistPrint(self.chatlist));
                    }
                    catch(e) {}
                }
                
                /* not in use
                if (typeof action == 'string') {
                    //tab.data('chatbox', action);
                } else {
                    tab.find('.imjs-chatbox').remove();
                    myDebug(debug_click, 'click 11');
                    tab.click(action);
                }
                */
                myDebug(debug_trace, 'addTab('+username+','+resume+','+selected+','+action+','+closable+') END', '-');
                return tab;
            },
            // END OF _addTab
            
            
            // === //private// {{{AjaxIM.}}}**{{{_addDateStamp(chatbox, restore_time)}}}** //
            //
            // Adds a date/time notifier to a chatbox. These are generally
            // inserted upon creation of a chatbox, or upon the date changing
            // since the last time a date stamp was added. If a date stamp for
            // the current date already exists, a new one will not be added.
            //
            // ==== Parameters ====
            // * {{{chatbox}}} refers to the jQuery-selected chatbox DOM element.
            // * {{{restore_time}}} is the date/time the date stamp will show. It is specified
            // in milliseconds since the Unix Epoch. This is //only// defined when
            // date stamps are being restored from storage; if not specified, the
            // current computer time will be used.
            
            _addDateStamp: function(chatbox, restore_time) {
                myDebug(debug_trace, '_addDateStamp('+chatbox+','+time+') START', '+');
                var time = restore_time ? restore_time : (new Date()).getTime();
                
                var date_stamp = $('.imjs-tab.imjs-default .imjs-chatbox .imjs-msglog .imjs-date').clone();
                
                var date_stamp_date = date_stamp.find('.imjs-date-date');
                var formatted_date = AjaxIM.dateFormat(time, date_stamp_date.html());
                
                if (chatbox.data('lastDateStamp') != formatted_date) {
                    // time
                    var date_stamp_time = date_stamp.find('.imjs-msg-time');
                    if (date_stamp_time.length) {
                        date_stamp_time.html(AjaxIM.dateFormat(time, date_stamp_time.html()));
                    }
                    // date
                    if (date_stamp_date.length) {
                        date_stamp_date.html(AjaxIM.dateFormat(time, date_stamp_date.html()));
                    }
                    chatbox.data('lastDateStamp', formatted_date);
                    if (!restore_time) {
                        this._storeNonMessage('datestamp', chatbox.data('username'), null, time);
                    }
                    chatbox.find('.imjs-msglog').append(date_stamp);
                }
                
                myDebug(debug_trace, '_addDateStamp('+chatbox+','+time+') END', '-');
                return time;
            },
            // END OF _addDateStamp
            
            
            // === {{{AjaxIM.}}}**{{{toggleTab()}}}** ===
            //
            // Activate a tab by setting it to the 'active' state and
            // showing any related chatbox. If a chatbox is available
            // for this tab, also focus the input box.
            //
            // //Note:// {{{this}}}, here, refers to the tab DOM element.
            
            toggleTab: function(tab) {
                myDebug(debug_trace, 'toggleTab() START', '+');
                // ### we use a parameter instead of setting this with .call
                // ### var tab = $(this);
                
                var chatbox = tab.find('.imjs-chatbox');
                
                if (tab.hasClass('imjs-maximized')) {
                    // tab is maximized, let's minimize it
                    tab.removeClass('imjs-maximized imjs-selected').addClass('imjs-minimized');
                    chatbox.hide();
                    if (tab.hasClass('imjs-tab')) {
                        $.each(self.chatlist, function() {
                            this.sel = false;
                        });
                    } else {
                        self.chatlist['#friends#'] = { id: 'imjs-friends', sel: false };
                    }
                    try {
                        $.jStore.store(self.storeKey + 'chatlist', self.chatlist);
                        myDebug(debug_storage, 'store '+self.storeKey+'chatlist='+self._chatlistPrint(self.chatlist));
                    }
                    catch(e) {
                        myDebug(true, 'ERROR store '+self.storeKey+'chatlist='+self._chatlistPrint(self.chatlist));
                    }
                    // trigger event
                    $(self).trigger('tabToggled', ['minimized', tab]);
                } else {
                    // tab is minimized or closed
                    // unselect and minimize all other chatboxes
                    if (tab.hasClass('imjs-tab')) {
                        $('.imjs-tab')
                            .not(tab)
                            .removeClass('imjs-maximized imjs-selected')
                            .not('.imjs-closed')
                            .not('.imjs-default')
                            .addClass('imjs-minimized')
                            .find('.imjs-chatbox')
                            .hide();
                        var username = chatbox.data('username');
                        $.each(self.chatlist, function(key, chat) {
                            if (key != '#friends#') {
                                chat.sel = (key == username);
                            }
                        });
                    } else {
                        self.chatlist['#friends#'] = { id: 'imjs-friends', sel: true }
                    }
                    // store activeTab
                    try {
                        $.jStore.store(self.storeKey + 'chatlist', self.chatlist);
                        myDebug(debug_storage, 'store '+self.storeKey+'chatlist='+self._chatlistPrint(self.chatlist));
                    }
                    catch(e) {
                        myDebug(true, 'ERROR store '+self.storeKey+'chatlist='+self._chatlistPrint(self.chatlist));
                    }
                    // set the tab to active and selected
                    tab.removeClass('imjs-minimized imjs-closed').addClass('imjs-maximized imjs-selected');
                    // display the activated box
                    chatbox.show();
                    // hide and reset the notification icon
                    tab.find('.imjs-notification').data('count', 0).hide();
                    // trigger event
                    $(self).trigger('tabToggled', ['activated', tab]);
                }
                
                if (chatbox.length) {
                    // store the height for resizing later
                    var input = chatbox.find('.imjs-input');
                    if (! input.data('height')) {
                        input.data('height', input.height());
                    }
                    // scroll message log
                    try {
                        var msglog = chatbox.find('.imjs-msglog');
                        msglog.scrollTop = msglog.scrollHeight;
                        // ### we try it without an index. not tested so far
                        // msglog[0].scrollTop = msglog[0].scrollHeight;
                    }
                    catch(e) {}
                    
                    // focus on input control
                    try {
                        chatbox.find('.imjs-input').focus();
                    }
                    catch(e) {}
                }
                myDebug(debug_trace, 'toggleTab() END', '-');
            },
            
            
            // === {{{AjaxIM.}}}**{{{bar.closeTab()}}}** ===
            //
            // Close a tab and hide any related chatbox, such that
            // the chatbox can not be reopened without reinitializing
            // the tab.
            //
            // //Note:// {{{this}}}, here, refers to the tab DOM element.
            
            closeTab: function(tab) {
                myDebug(debug_trace, 'closeTab() START', '+');
                // ### we use a parameter instead of setting this with .call
                // var tab = $(this).parents('.imjs-tab');
                tab.removeClass('imjs-maximized imjs-minimized imjs-selected').addClass('imjs-closed').hide();
                var username = tab.find('.imjs-chatbox').data('username');
                delete self.chatlist[username];
                // store chatlist
                var empty = true;
                $.each(self.chatlist, function() {
                    empty = false;
                    return false;
                });
                if (empty) {
                    try {
                        $.jStore.remove(self.storeKey + 'chatlist');
                        myDebug(debug_storage, 'remove '+self.storeKey+'chatlist');
                    }
                    catch(e) {}
                } else {
                    try {
                        $.jStore.store(self.storeKey + 'chatlist', self.chatlist);
                        myDebug(debug_storage, 'store '+self.storeKey+'chatlist='+self._chatlistPrint(self.chatlist));
                    }
                    catch(e) {}
                }
                
                if (self.scrollLeft > 0) {
                    tempScrollLeft = self.scrollLeft - 1;
                    self._scrollers();
                    for (i = 1; i <= tempScrollLeft; i++) {
                        $('#imjs-scroll-left').click();
                    }
                    self.scrollLeft = tempScrollLeft;
                    $.jStore.store(self.storeKey + 'scrollLeft', self.scrollLeft.toString());
                } else {
                    self._scrollers();
                }
                $(self).trigger('tabToggled', ['closed', tab]);
                myDebug(debug_trace, 'closeTab() END', '-');
            },
            
            
            // === //private// {{{AjaxIM.}}}**{{{_addMessage(ab, chatbox, username, message, time)}}}** //
            //
            // Adds a message to a chatbox. Depending on the {{{ab}}} value,
            // the color of the username may change as a way of visually
            // identifying users (however, this depends on the theme's CSS).
            // A timestamp is added to the message, and the chatbox is scrolled
            // to the bottom, such that the new message is visible.
            //
            // Messages will be automatically tag-escaped, so as to prevent
            // any potential cross-site scripting problems. Additionally,
            // URLs will be automatically linked.
            //
            // ==== Parameters ====
            // * {{{ab}}} refers to whether the user is "a" or "b" in a conversation.
            // For the general case, "you" are "a" and "they" are "b".
            // * {{{chatbox}}} refers to the jQuery-selected chatbox DOM element.
            // * {{{from_username}}} is the username of the user who sent the message.
            // * {{{time}}} is the time the message was sent in milliseconds since
            // the Unix Epoch. This is //only// defined when messages are being
            // restored from storage. For new messages, the current computer
            // time is automatically used.
            
            _addMessage: function(ab, chatbox, from_username, message, time) {
                myDebug(debug_trace || debug_chatbox, '_addMessage('+ab+','+chatbox+','+from_username+','+message+','+time+') START', '+');
                var last_message = chatbox.find('.imjs-msglog > *:last-child');
                if (last_message.hasClass('imjs-msg-' + ab)) {
                    // Last message was from the same person, so let's just add another imjs-msg-*-msg
                    var message_container = (last_message.hasClass('imjs-msg-' + ab + '-container') ?
                        last_message : last_message.find('.imjs-msg-' + ab + '-container'));
                        
                    var single_message =
                        $('.imjs-tab.imjs-default .imjs-chatbox .imjs-msglog .imjs-msg-' + ab + '-msg')
                        .clone().appendTo(message_container);
                    
                    single_message.html(single_message.html().replace('{username}', from_username));
                } else if (!last_message.length || !last_message.hasClass('imjs-msg-' + ab)) {
                    var message_group = $('.imjs-tab.imjs-default .imjs-chatbox .imjs-msg-' + ab)
                        .clone().appendTo(chatbox.find('.imjs-msglog'));
                    message_group.html(message_group.html().replace('{username}', from_username));
                    
                    var single_message = message_group.find('.imjs-msg-' + ab + '-msg');
                }
                
                // clean up the message
                message = message.replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/(^|.*)\*([^*]+)\*(.*|$)/, '$1<strong>$2</strong>$3');
                
                // autolink URLs
                message = message.replace(
                    new RegExp('([A-Za-z][A-Za-z0-9+.-]{1,120}:[A-Za-z0-9/]' +
                    '(([A-Za-z0-9$_.+!*,;/?:@&~=-])|%[A-Fa-f0-9]{2}){1,333}' +
                    '(#([a-zA-Z0-9][a-zA-Z0-9$_.+!*,;/?:@&~=%-]{0,1000}))?)', 'g'),
                    '<a href="$1" target="_blank">$1</a>');
                
                // insert the message
                single_message.html(single_message.html().replace('{message}', message));
                
                // set the message time
                var msgtime = single_message.find('.imjs-msg-time');
                if (!time) {
                    time = new Date();
                }
                
                if (typeof time != 'string') {
                    time = AjaxIM.dateFormat(time, msgtime.html());
                }
                
                msgtime.html(time);
                
                var msglog = chatbox.find('.imjs-msglog');
                msglog[0].scrollTop = msglog[0].scrollHeight;
                
                myDebug(debug_trace || debug_chatbox, '_addMessage('+ab+','+chatbox+','+from_username+','+message+','+time+') END', '-');
                return time;
            },
            // END OF _addMessage
            
            
            // === //private// {{{AjaxIM.}}}**{{{_addError(chatbox, error)}}}** //
            //
            // Adds an error to a chatbox. These are generally inserted after
            // a user sends a message unsuccessfully. If an error message
            // was already added, another one will be added anyway.
            //
            // ==== Parameters ====
            // * {{{chatbox}}} refers to the jQuery-selected chatbox DOM element.
            // * {{{error}}} is the error message string.
            // * {{{time}}} is the date/time the error occurred. It is specified in
            // milliseconds since the Unix Epoch. This is //only// defined when
            // errors are being restored from storage; if not specified, the current
            // computer time will be used.
            
            _addError: function(chatbox, error, time) {
                myDebug(debug_trace || debug_chatbox, '_addError('+chatbox+','+error+','+time+') START', '+');
                var message_log = chatbox.find('.imjs-msglog');
                
                var error_item = $('.imjs-tab.imjs-default .imjs-chatbox .imjs-msglog .imjs-error').clone();
                
                var error_item_time = error_item.find('.imjs-msg-time');
                if (error_item_time.length) {
                    if (!time) {
                        time = (new Date()).getTime();
                    }
                    error_item_time.html(AjaxIM.dateFormat(time, error_item_time.html()));
                }
                
                error_item.find('.imjs-error-error').html(error);
                error_item.appendTo(message_log);
                
                message_log[0].scrollTop = message_log[0].scrollHeight;
                myDebug(debug_trace || debug_chatbox, '_addError('+chatbox+','+error+','+time+') END', '-');
            },
            // END OF _addError
            
            
            // === {{{AjaxIM.}}}**{{{poll()}}}** ===
            //
            // Queries the server for new messages. If a 'long' or 'short' poll
            // type is used, jQuery's {{{$.post}}} or {{{$.getJSON}}} will be
            // used. If 'comet' is used, the server connection will be deferred
            // to the comet set of functions.
            
            poll: function() {
                if (debug_poll) myDebug(debug_poll, 'poll() START', '+');
                if (this.settings.pollType == 'short' || this.settings.pollType == 'long') {
                    if (debug_poll) myDebug(debug_poll, this.settings.pollType+':action='+this.actions.poll);
                    AjaxIM.request(
                        this.actions.poll,
                        {},
                        function(response) {
                            if (debug_poll) myDebug(debug_poll, 'callback poll START', '+');
                            if (debug_poll) myDebug(debug_poll, 'response='+response);
                            if (!response['e']) {
                                if (debug_poll) myDebug(debug_poll, 'poll success');
                                if (response.length) {
                                    self._parseMessages(response);
                                }
                                if (self.username) {
                                    setTimeout(function() { self.poll(); }, INTERVAL);
                                }
                            } else {
                                myDebug(true, 'poll failed, response.e='+response.e);
                                switch(response.e) {
                                    case 'no session found':
                                        // user signed out
                                        myDebug(true, 'not connected because "no session found" returned from poll');
                                        self._notConnected();
                                    break;
                                }
                                $(self).trigger('pollFailed', [response.e]);
                            }
                            if (debug_poll) myDebug(debug_poll, 'callback poll END', '-');
                        },
                        function(error) {
                            myDebug(true, 'callback error poll START', '+');
                            myDebug(true, 'not connected');
                            self._notConnected();
                            $(self).trigger('pollFailed', ['not connected']);
                            // try reconnecting?
                            myDebug(true, 'callback error poll END', '-');
                        }
                    );
                } else if (this.settings.pollType == 'comet') {
                    if (debug_poll) myDebug(debug_poll, 'comet: call this.comet.connect()');
                    this.comet.connect();
                }
                if (debug_poll) myDebug(debug_poll, 'poll() END', '-');
            },
            // END OF poll
            
            
            // === {{{AjaxIM.}}}**{{{send(to, message)}}}** ===
            //
            // Sends a message to another user. The message will be added
            // to the chatbox before it is actually sent, however, if an
            // error occurs during sending, that will be indicated immediately
            // afterward.
            //
            // After sending the message, one of three status codes should be
            // returned as a JSON object, e.g. {{{{r: 'code'}}}}:
            // * {{{ok}}} &mdash; Message was sent successfully.
            // * {{{offline}}} &mdash; The user is offline or unavailable to
            // receive messages.
            // * {{{error}}} &mdash; a problem occurred, unrelated to the user
            // being unavailable.
            //
            // ==== Parameters ====
            // * {{{to}}} is the username of the recipient.
            // * {{{message}}} is the content to be sent.
            
            send: function(to, message) {
                myDebug(debug_trace || debug_send, 'send('+to+', '+message+') START', '+');
                if (!message) return;
                var chatbox = $('#'+self.chatlist[to].id);
                // add a datestamp if the date changes
                var time = self._addDateStamp(chatbox);
                    
                time = this._addMessage('a', chatbox, this.username, message);
                this._storeMessage('a', to, this.username, message, time);
                
                $(self).trigger('sendingMessage', [to, message]);
                
                myDebug(debug_send, 'action='+this.actions.send);
                AjaxIM.request(
                    this.actions.send,
                    {'to': to, 'message': message},
                    function(response) {
                        myDebug(debug_trace || debug_send, 'callback send START', '+');
                        myDebug(debug_send, 'response.r='+response.r);
                        switch(response.r) {
                            case 'ok':
                                $(self).trigger('sendMessageSuccessful', [to, message]);
                            break;
                            
                            case 'offline':
                                $(self).trigger('sendMessageFailed', ['offline', to, message]);
                            break;
                            
                            case 'error':
                            default:
                                if (response.e == 'no session found') {
                                    myDebug(debug_send || debug_connection, 'not connected, because no session is found');
                                    self._notConnected();
                                    self._addError($(self.chatlist[to].id), AjaxIM.i18n.notConnected);
                                    self._storeNonMessage('error', to, AjaxIM.i18n.notConnected, (new Date()).getTime());
                                }
                                
                                $(self).trigger('sendMessageFailed', [response.e, to, message]);
                            break;
                        }
                        myDebug(debug_trace || debug_send, 'callback send END', '-');
                    },
                    function(error) {
                        myDebug(debug_trace || debug_send || debug_connection, 'callback error send START', '+');
                        myDebug(debug_send || debug_connection, 'ajax error => not connected');
                        self._notConnected();
                        self._addError($(self.chatlist[to].id), AjaxIM.i18n.notConnected);
                        self._storeNonMessage('error', to, AjaxIM.i18n.notConnected, (new Date()).getTime());
                        
                        $(self).trigger('sendMessageFailed', ['not connected', to, message]);
                        myDebug(debug_trace || debug_send || debug_connection, 'callback error send END', '-');
                    }
                );
                myDebug(debug_trace || debug_send, 'send('+to+', '+message+') END', '-');
            },
            // END OF send
            
            
            // === {{{AjaxIM.}}}**{{{status(s, message)}}}** ===
            //
            // Sets the user's status and status message. It is possible to not
            // set a status message by setting it to an empty string. The status
            // will be sent to the server, where upon the server will broadcast
            // the update to all individuals with "you" on their friends list.
            //
            // ==== Parameters ====
            // * {{{s}}} is the status code, as defined by {{{AjaxIM.statuses}}}.
            // * {{{message}}} is the custom status message.
            
            status: function(s, message) {
                // update status icon(s)
                myDebug(debug_trace || debug_status, 'status('+s+','+message+') START', '+');
                if (!this.statuses[s]) {
                    return;
                }
                
                $('#imjs-friends').attr('class', 'imjs-' + s);
                
                $(self).trigger('changingStatus', [s, message]);
                
                myDebug(debug_status, 'action='+this.actions.status);
                AjaxIM.request(
                    this.actions.status,
                    {'status': this.statuses[s], 'message': message},
                    function(response) {
                        myDebug(debug_trace || debug_status, 'callback status START', '+');
                        myDebug(debug_status, 'response.r='+response.r);
                        switch(response.r) {
                            case 'ok':
                                $(self).trigger('changeStatusSuccessful', [s, message]);
                            break;
                            
                            case 'error':
                            default:
                                $(self).trigger('changeStatusFailed', [response.e, s, message]);
                            break;
                        }
                        myDebug(debug_trace || debug_status, 'callback status END', '-');
                    },
                    function(error) {
                        myDebug(debug_trace || debug_status, 'callback error status START', '+');
                        $(self).trigger('changeStatusFailed', ['not connected', s, message]);
                        myDebug(debug_trace || debug_status, 'callback error status END', '-');
                    }
                );
            },
            // END OF status
            
            
            // === //private// {{{AjaxIM.}}}**{{{_parseMessages(messages)}}}** ===
            //
            // Handles an incoming message array:\\
            // {{{[{t: 'type', s: 'sender', r: 'recipient', m: 'message'}, ...]}}}
            //
            // * {{{t}}} (message type) is one of:
            // ** {{{m}}} &mdash; a standard message
            // ** {{{s}}} &mdash; a user's status update
            // ** {{{b}}} &mdash; a broadcasted message (sent to many users simultaneously)
            // * {{{s}}} is the sender of the message.
            // * {{{r}}} is the intended recipient of the message. Most of the time, this will
            // simply be the logged in user, however, a broadcasted message may not specify
            // a recipient or may specify a different recipient. Also provides future
            // compatability for chatrooms.
            // * {{{m}}} is the actual message. For something such as a status update, this can
            // be a JSON object or parsable string; e.g. {{{"2:I'm away."}}}
            //
            // ==== Parameters ====
            // * {{{messages}}} is the message array
            
            _parseMessages: function(messages) {
                myDebug(debug_trace || debug_poll, '_parseMessages('+messages+') START', '+');
                if ($.isArray(messages)) {
                    $.each(messages, function() {
                        $(self).trigger('parseMessage', [this]);
                        myDebug(debug_poll, 'type='+this.t+',sender='+this.s+',recipient='+this.r+',message='+this.m);
                        switch(this.t) {
                            case 'm':
                                self._incoming(this.s, this.m);
                            break;
                            
                            case 's':
                                // ### we need to change the backend to pass status and message in separate vars
                                var status = this.m.split(':');
                                if (this['g']) {
                                    self._addFriend(this.s, status, message, this.g);
                                }
                                self._friendUpdate(this.s, status, message);
                                self._storeFriends();
                            break;
                            
                            case 'b':
                            break;
                            
                            default:
                            break;
                        }
                    });
                }
                myDebug(debug_trace || debug_poll, '_parseMessages('+messages+') END', '-');
            },
            // END OF _parseMessages
            
            
            // === // private // {{{AjaxIM.}}}**{{{_incoming(from, message)}}}** ===
            //
            // Handles a new message from another user. If a chatbox for that
            // user does not yet exist, one is created. If it does exist, but
            // is minimized, the user is notified but the chatbox is not brought
            // to the front. This function also stores the message, if a storage
            // method is set.
            //
            // ==== Parameters ====
            // * {{{from}}} is the username of the sender.
            // * {{{message}}} is the body.
            
            _incoming: function(from, message) {
                myDebug(debug_trace || debug_poll, '_incoming('+from+','+message+') START', '+');
                // check if IM exists, otherwise create new window
                // TODO: If friend is not on the buddylist,
                // should add them to a temp list?
                var chatbox = this._createChatbox(from, false, false);
                var tab = chatbox.parents('.imjs-tab');
                
                if (! $('#imjs-bar .imjs-selected').length) {
                    myDebug(debug_click, 'click 12');
                    tab.click();
                } else if (! tab.hasClass('imjs-maximized')) {
                    self._notification(tab);
                }
                
                var time = this._addMessage('b', chatbox, from, message);
                this._storeMessage('b', from, from, message, time);
                myDebug(debug_trace || debug_poll, '_incoming('+from+','+message+') END', '-');
            },
            // END OF incomin
            
            
            // === //private// {{{AjaxIM.}}}**{{{_storeMessage(ab, chatbox_usernameklokl,, username, message, time)}}}** ===
            //
            // Taking the same arguments as {{{AjaxIM._addMessage}}}, {{{_storeMessage}}} pushes a message
            // into the storage hash, if storage is enabled.
            //
            // Messages are added to a message array, by username. The entire chat hash is stored as
            // a {{{'chatstore'}}} object in whatever storage engine is enabled.
            
            _storeMessage: function(ab, chatbox_username, username, message, time) {
                myDebug(debug_trace, '_storeMessage('+ab+','+chatbox_username+','+username+','+message+','+time+') START', '+');
                // If storage is on & ready, store the message
                if (this.settings.storageMethod) {
                    // sanitize message
                    message = message.replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    
                    if (!(chatbox_username in this.chatstore)) {
                        // initialize chatstore
                        this.chatstore[chatbox_username] = [];
                    } else if (this.chatstore[chatbox_username].length > 300) {
                        // if the chatstore gets too long, it becomes slow to load.
                        this.chatstore[chatbox_username].shift();
                    }
                    
                    // for some reason, if we don't encode and decode the message, it *will* break
                    // (at least) the Flash storage engine's retrieval. Gah!
                    this.chatstore[chatbox_username].push([ab, username, encodeURIComponent(message), time]);
                    
                    try {
                        $.jStore.store(this.storeKey + 'chatstore', this.chatstore);
                        myDebug(debug_storage, 'store '+this.storeKey+'chatstore='+this._chatstorePrint(this.chatstore));
                    }
                    catch (e) {}
                }
                myDebug(debug_trace, '_storeMessage('+ab+','+chatbox_username+','+username+','+message+','+time+') END', '-');
            },
            // END OF _storeMessage
            
            
            // === //private// {{{AjaxIM.}}}**{{{_storeNonMessage(type, username, data, time)}}}** ===
            //
            // **Redundant?**\\
            // Similar to {{{AjaxIM._storeMessage}}}, but stores items that aren't messages,
            // such as datestamps and errors.
            //
            // ==== Parameters ====
            // * {{{type}}} is the type of non-message (error, datestamp).
            // * {{{username}}} is the username of the user being chatted with.
            // * {{{data}}} is the (optional) data of the non-message to be stored.
            // * {{{time}}} is the time of the message.
            
            _storeNonMessage: function(type, username, data, time) {
                myDebug(debug_trace, '_storeNonMessage('+type+','+username+','+data+','+time+') START', '+');
                // If storage is on & ready, store the non-message
                if (this.settings.storageMethod) {
                    
                    if (!(username in this.chatstore)) {
                        this.chatstore[username] = [];
                    } else if (this.chatstore[username].length > 300) {
                        // If the chatstore gets too long, it becomes slow to load.
                        // ### to do: we need to take care not to remove a timestamp ###
                        this.chatstore[username].shift();
                    }
                    
                    // For some reason, if we don't encode and decode the message, it *will* break
                    // (at least) the Flash storage engine's retrieval. Gah!
                    this.chatstore[username].push([type, username, encodeURIComponent(data), time]);
                    
                    try {
                        $.jStore.store(this.storeKey + 'chatstore', this.chatstore);
                        myDebug(debug_storage, 'store '+self.storeKey+'chatstore='+this._chatstorePrint(this.chatstore));
                    }
                    catch(e) {}
                }
                myDebug(debug_trace, '_storeNonMessage('+type+','+username+','+data+','+time+') END', '-');
            },
            // END OF _storeNonMessage
            
            
            // === // private // {{{AjaxIM.}}}**{{{_notification(tab)}}}** ===
            //
            // Displays a notification on a tab. Generally, this is called when
            // a tab is minimized to let the user know that there is an update
            // for them. The way the notification is displayed depends on the
            // theme CSS.
            //
            // ==== Parameters ====
            // * {{{tab}}} is the jQuery-selected tab DOM element.
            
            _notification: function(tab) {
                myDebug(debug_trace, 'function _notification('+tab+') START', '+');
                var notify = tab.find('.imjs-notification');
                var notify_count = notify.data('count') + 1;
                
                notify.data('count', notify_count)
                    .html(notify.data('default-text').replace('{count}', notify_count))
                    .show();
                myDebug(debug_trace, 'function _notification('+tab+') END', '-');
            },
            
            
            // === //private// {{{AjaxIM.}}}**{{{_notConnected()}}}** ===
            //
            // Puts the user into a visible state of disconnection. Sets the
            // friends list to "not connected" and empties it; disallows new messages
            // to be sent.
            
            _notConnected: function() {
                myDebug(debug_trace || debug_connection, '_notConnected() START', '+');
                // no need to remove the click handler. the click handler checks if the user is signed in.
                // we could get rid of _notConnected now.
                // if we need it for "real" connection checking (excluding checking if the user is signed in),
                // we probably need to make some changes to the connection handling and checking
                
                // $('#imjs-friends').addClass('imjs-not-connected').unbind('click', this.toggleTab);
                myDebug(debug_trace || debug_connection, '_notConnected() END', '-');
            },
            // END OF _notConnected
            
            
            // === //private// {{{AjaxIM.}}}**{{{_friendsPrint()}}}** ===
            //
            // Utility to display a friends data structure
            
            _friendsPrint: function(friends) {
                var s = '';
                $.each(friends, function(username, f) {
                    if (s) s += "\n";
                    s += '{ ' + username + ' {status:' + f.status + ', message:' + f.message + ', group:' + f.group + '} }';
                });
                return s;
            },
            
            
            // === //private// {{{AjaxIM.}}}**{{{_chatlistPrint()}}}** ===
            //
            // Utility to display a chatlist data structure
            
            _chatlistPrint: function(chatlist) {
                var s = '';
                $.each(chatlist, function(username, chat) {
                    s += "\n" + '{ ' + username + ' { ' + chat.id + ', ' + chat.sel + ' } }';
                });
                return s;
            },
            
            
            // === //private// {{{AjaxIM.}}}**{{{_chatstorePrint()}}}** ===
            //
            // Utility to display a chatstore data structure
            
            _chatstorePrint: function(chatstore) {
                s = '';
                $.each(chatstore, function(username, chat) {
                    s += "\n" + '{ ' + username;
                    $.each(chat, function() {
                        s += "\n" + ' {' + this[0] + ', ' + this[1] + ', ' + this[2] + ', ' + this[3] + ' } ';
                    });
                    s += ' }';
                });
                return s;
            },
            
            
            // === //private// {{{AjaxIM.}}}**{{{bar._scrollers()}}}** ===
            //
            // Document me!
            
            _scrollers: function() {
                myDebug(debug_trace || debug_scrollers, '_scrollers() START', '+');
                var needScrollers = false;
                
                // display all tabs so we can check if the bar breaks
                $('.imjs-tab').not('.imjs-closed').not('.imjs-default').show();
                
                var h = $('#imjs-bar').height();
                
                // check all visible tabs and hide those which break the bar
                $.each(self.chatlist, function(username, chat) {
                    if (username != '#friends#') {
                        myDebug(debug_scrollers, 'check username '+username+' '+chat.id);
                        var tab = $('#'+chat.id).parents('.imjs-tab');
                        if (tab.length && ! tab.hasClass('imjs-closed')) {
                            myDebug(debug_scrollers, 'tab.position().top='+tab.position().top+', h='+h);
                            if (tab.position().top > h) {
                                tab.hide();
                                needScrollers = true;
                            }
                        }
                    }
                });
                
                if (needScrollers) {
                    var hiddenLeft = $('#imjs-bar li.imjs-tab:visible')
                        .last()
                        .nextAll('#imjs-bar li.imjs-tab:hidden')
                        .not('.imjs-default')
                        .not('.imjs-closed')
                        .length;
                    
                    var hiddenRight = $('#imjs-bar li.imjs-tab:visible')
                        .first()
                        .prevAll('#imjs-bar li.imjs-tab:hidden')
                        .not('.imjs-default')
                        .not('.imjs-closed')
                        .length;
                    
                    $('#imjs-scroll-left div').html(hiddenLeft);
                    $('#imjs-scroll-right div').html(hiddenRight);
                    $('.imjs-scroll').show();
                    // hide one more tab if scrollers break the line
                    if ($('#imjs-scroll-left').position().top > h || $('#imjs-scroll-right').position().top > h) {
                        myDebug(debug_scrollers, 'scrollers break the line, hide one more tab.');
                        $('#imjs-bar li.imjs-tab:visible').last().hide();
                    }
                } else {
                    $('.imjs-scroll').hide();
                }
                myDebug(debug_trace || debug_scrollers, '_scrollers() END', '-');
            },
            // END OF _scrollers
            
            
            // == Comet ==
            //
            // Comet, or HTTP streaming, holds open a connection between the client and
            // the server indefinitely. As the server receives new messages or events,
            // they are passed down to the client in a {{{&lt;script&gt;}}}
            // tag which calls the {{{AjaxIM.incoming()}}} function. The connection is
            // opened using either an {{{iframe}}} (in Opera or Internet Explorer) or
            // an {{{XMLHTTPRequest}}} object. Due to the extra flexibility necessary
            // with the {{{XMLHTTPRequest}}} object, jQuery's {{{$.ajax}}} is not used.
            comet: {
                type: '',
                obj: null,
                
                onbeforeunload: null,
                onreadystatechange: null,
                
                iframe: function() {
                    if (this.obj.readyState == 'loaded' || this.obj.readyState == 'complete') {
                        throw new Error("IM server not available!");
                    }
                },
                
                // === {{{AjaxIM.}}}**{{{comet.connect()}}}** ===
                //
                // Creates and initializes the object and connection between the server
                // and the client. For Internet Explorer and Opera, we use an
                // {{{&lt;iframe&gt;}}} element; for all other browsers, we create an
                // {{{XMLHTTPRequest}}} object. The server connects to the URI defined
                // as the "poll" action. This function is called automatically, when
                // the IM engine is initialized and the {{{AjaxIM.poll()}}} function
                // is called.
                connect: function() {
                    myDebug(debug_trace || debug_poll, 'comet.connect() START', '+');
                    if ($.browser.opera || $.browser.msie) {
                        var iframe = $('<iframe></iframe>');
                        with(iframe) {
                            css({
                                position: 'absolute',
                                visibility: 'visible',
                                display: 'block',
                                left: '-10000px',
                                top: '-10000px',
                                width: '1px',
                                height: '1px'
                            });
                            attr('src', self.actions.poll[1]);
                            appendTo('body');
                            bind('readystatechange', self.comet.onreadystatechange = function() { self.comet.iframe() });
                            bind('beforeunload', self.comet.onbeforeunload = function() { self.comet.disconnect() });
                        }
                        self.comet.type = 'iframe';
                        self.comet.obj = iframe;
                    } else {
                        myDebug(debug_poll, 'connect with XMLHttpRequest');
                        var xhr = new XMLHttpRequest;
                        var length = 1029;
                        var code = /^\s*<script[^>]*>parent\.(.+);<\/script><br\s*\/>$/;
                        
                        xhr.open('get', self.actions.poll[1], true);
                        xhr.onreadystatechange = function() {
                            myDebug(debug_trace || debug_poll, 'callback comet START', '+');
                            myDebug(debug_poll, 'readyState='+xhr.readyState+',status='+xhr.status);
                            myDebug(debug_poll, 'responseText='+ (typeof xhr.responseText == 'undefined' ? 'undefined' : xhr.responseText))
                            if (xhr.readyState > 2) {
                                if (xhr.status == 200) {
                                    responseText = xhr.responseText.substring(length);
                                    myDebug(debug_poll, 'responseText='+responseText);
                                    length = xhr.responseText.length;
                                    if (responseText != ' ') {
                                        eval(responseText.replace(code, "$1"));
                                    }
                                }
                                // We need an "else" here. If the state changes to
                                // "loaded", the user needs to know they're
                                // disconnected.
                            }
                            myDebug(debug_trace || debug_poll, 'callback comet END', '-');
                        };
                        
                        self.comet.type = 'xhr';
                        self.comet.obj = xhr;
                        
                        addEventListener('beforeunload', self.comet.beforeunload = function() { self.comet.disconnect(); }, false);
                        setTimeout(function() { xhr.send(null) }, 10);
                    }
                    myDebug(debug_trace || debug_poll, 'comet.connect() END', '-');
                },
                
                // === {{{AjaxIM.}}}**{{{comet.disconnect()}}}** ===
                //
                // Disconnect from the server and destroy the connection object. This
                // function is called before the page unloads, so that we plug up and
                // potential leaks and free memory.
                disconnect: function() {
                    myDebug(debug_trace || debug_connection, 'comet.disconnect() START', '+');
                    if (!this.type || !this.obj) {
                        return;
                    }
                    if (this.type == 'iframe') {
                        detachEvent('onreadystatechange', this.onreadystatechange);
                        detachEvent('onbeforeunload', this.onbeforeunload);
                        this.obj.src = '.';
                        $(this.obj).remove();
                    } else {
                        removeEventListener('beforeunload', this.onbeforeunload, false);
                        this.obj.onreadystatechange = function(){};
                        this.obj.abort();
                    }
                    delete this.obj;
                    myDebug(debug_trace || debug_connection, 'comet.disconnect() END', '-');
                }
            },
            // END OF comet
            
            
            // == Cookies ==
            //
            // The "cookies" functions can be used to set, get, and erase JSON-based cookies.
            // These functions are primarily used to manage and read the server-set cookie
            // that handles the user's chat session ID.
            
            cookies: {
                // === {{{AjaxIM.}}}**{{{cookies.set(name, value, days)}}}** ===
                //
                // Sets a cookie, stringifying the JSON value upon storing it.
                //
                // ==== Parameters ====
                // * {{{name}}} is the cookie name.\\
                // * {{{value}}} is the cookie data that you would like to store.\\
                // * {{{days}}} is the number of days that the cookie will be stored for.
                set: function(name, value, days) {
                    myDebug(debug_trace, 'cookies.set('+name+','+value+','+days+') START', '+');
                    if (days) {
                        var date = new Date();
                        date.setTime(date.getTime() + (days * 24 * 60 * 60 * 1000));
                        var expires = "; expires=" + date.toGMTString();
                    } else {
                        var expires = "";
                    }
                    document.cookie = name + "=" + $.toJSON(value) + expires + "; path=/";
                    myDebug(debug_trace, 'cookies.set('+name+','+value+','+days+') END', '-');
                },
                
                // === {{{AjaxIM.}}}**{{{cookies.get(name)}}}** ===
                //
                // Gets a cookie, decoding the JSON value before returning the data.
                //
                // ==== Parameters ====
                // * {{{name}}} is the cookie name that you would like to retrieve.
                get: function(name) {
                    myDebug(debug_trace, 'cookies.get('+name+') START', '+');
                    var nameEQ = name + "=";
                    var ca = document.cookie.split(';');
                    for (var i = 0; i < ca.length; i++) {
                        var c = ca[i];
                        while (c.charAt(0) == ' ') {
                            c = c.substring(1, c.length);
                        }
                        if (c.indexOf(nameEQ) == 0) {
                            var cval = decodeURIComponent(c.substring(nameEQ.length, c.length));
                            return $.secureEvalJSON(cval);
                        }
                    }
                    myDebug(debug_trace, 'cookies.get('+name+') END', '-');
                    return null;
                },
                
                // === {{{AjaxIM.}}}**{{{cookies.erase(name)}}}** ===
                //
                // Deletes a cookie.
                //
                // {{{name}}} is the existing cookie that you would like to delete.
                erase: function(name) {
                    myDebug(debug_trace, 'cookies.erase('+name+') START', '+');
                    self.cookies.set(name, '', -1);
                    myDebug(debug_trace, 'cookies.erase('+name+') END', '-');
                }
            },
            // END OF cookies
            
            
            // === {{{AjaxIM.}}}**{{{form(element)}}}** ===
            //
            // Loads a login and registration form into the specified element
            // or, if no element is supplied, to the location on the page from
            // which this function was called.
            
            form: function(element) {
                myDebug(debug_trace, 'form('+element+') START', '+');
                jQuery(document).ready(function() {
                    $(element).load(self.settings.theme + '/theme.html #imjs-lr', function() {
                        // init
                        $('#imjs-lr .error').hide();
                        if (self.username) {
                            $('#imjs-register, #imjs-login fieldset').hide();
                            $('#imjs-logged-in strong').html(self.username);
                            $('#imjs-logged-in').show();
                        } else {
                            $('#imjs-logged-in').hide();
                        }
                        
                        // handle logout success
                        $(self).bind('logoutSuccessful', function() {
                            $('#imjs-login fieldset').slideDown();
                            $('#imjs-register').slideDown();
                            $('#imjs-logged-in strong').html('{username}');
                            $('#imjs-logged-in').slideUp();
                        });
                        
                        // handle login error or success
                        $(self).bind('loginError', function() {
                            $('#imjs-login .error').html(AjaxIM.i18n.authInvalid).slideDown('fast');
                            $('#imjs-login input')
                                .addClass('imjs-lr-error')
                                .blur(function() { $(self).removeClass('imjs-lr-error'); });
                        }).bind('loginSuccessful', function() {
                            $('#imjs-login-username').val('');
                            $('#imjs-login-password').val('');
                            $('#imjs-login fieldset').slideUp();
                            $('#imjs-register').slideUp();
                            $('#imjs-logged-in strong').html(self.username)
                            $('#imjs-logged-in').slideDown();
                        });
                        
                        // ### click-handler (temporarily hard-wired in HTML
                        /*
                        $('#imjs-logged-in a').click(function() {
                            self.logout();
                            return false;
                        });
                        
                        var login = function() {
                            self.login($('#imjs-login-username').val(), $('#imjs-login-password').val());
                            return false;
                        };
                        $('#imjs-login').submit(login);
                        $('#imjs-login-submit').click(login);
                        */
                        
                        var regIssues = false;
                        var regError = function(error, fields) {
                            $('#imjs-register .error')
                                .append(AjaxIM.i18n['register' + error] + ' ')
                                .slideDown();
                            $(fields)
                                .addClass('imjs-lr-error')
                                .blur(function() { $(self).removeClass('imjs-lr-error'); });
                            regIssues = true;
                        };
                        
                        var register = function() {
                            $('#imjs-register .error').empty();
                            
                            regIssues = false;
                            
                            var username = $('#imjs-register-username').val();
                            var password = $('#imjs-register-password').val();
                            
                            if (password.length < 4) {
                                regError('PasswordLength', '#imjs-register-password');
                            }
                            if (password != $('#imjs-register-cpassword').val()) {
                                regError('PasswordMatch', '#imjs-register-password, #imjs-register-cpassword');
                            }
                            if (username.length <= 2 || !$('#imjs-register-username').val().match(/^[A-Za-z0-9_.]+$/)) {
                                regError('UsernameLength', '#imjs-register-username');
                            }
                            if (!regIssues) {
                                myDebug(debug_trace, 'action='+this.actions.register);
                                AjaxIM.request(
                                    self.actions.register,
                                    {username: username, password: password},
                                    function(response) {
                                        if (response.r == 'registered') {
                                            self.login(username, password);
                                        } else if (response.r == 'error') {
                                            switch (response.e) {
                                                case 'unknown':
                                                    regError('Unknown', '');
                                                break;
                                                
                                                case 'invalid password':
                                                    regError('PasswordLength', '#imjs-register-password');
                                                break;
                                                
                                                case 'invalid username':
                                                    regError('UsernameLength', '#imjs-register-username');
                                                break;
                                                
                                                case 'username taken':
                                                    regError('UsernameTaken', '#imjs-register-username');
                                                break;
                                            }
                                        }
                                    },
                                    function(error) {
                                        regError('Unknown', '');
                                    }
                                );
                            }
                            
                            return false;
                        };
                        $('#imjs-register').submit(register);
                        $('#imjs-register-submit').click(register);
                    });
                });
                myDebug(debug_trace, 'form('+element+') END', '-');
            }
            // END OF form
        });
        // END OF $.extend(AjaxIM.prototype, {
        
        
        // try to resume any existing session (used to be in queue)
        self.resume();
        
        // run queued method calls
        myDebug(debug_trace, 'run prequeue');
        if (this.prequeue.length) {
            $.each(this.prequeue, function() {
                func = this[0];
                args = this[1];
                myDebug(debug_trace, 'prequeue run: '+func); for (i=0; i<args.length; i++) myDebug(debug_trace, '  args['+i+']='+args[i]);
                var f = func.split('.');
                if (f.length == 1) {
                    myDebug(debug_trace, 'self['+f[0]+'].apply(self, '+args+')');
                    self[f[0]].apply(self, args);
                } else {
                    myDebug(debug_trace, 'self['+f[0]+']['+f[1]+'].apply(self, '+args+')');
                    self[f[0]][f[1]].apply(self, args);
                }
            });
        }
        
        // ### scrollers on resume are handled in callback function of resume()
        // ### after login, we won't need any scrollers
        // ### as long as we don't load a page, scrollers are added and removed
        // ### dynamically after adding or removing a tab
        
        // self._scrollers();
        myDebug(debug_trace, 'setup() END', '-');
    };
    // END OF setup
    
    
    // == Static functions and variables ==
    //
    // The following functions and variables are available outside of an initialized
    // {{{AjaxIM}}} object.
    
    // === {{{AjaxIM.}}}**{{{client}}}** ===
    //
    // Once {{{AjaxIM.init()}}} is called, this will be set to the active AjaxIM
    // object. Only one AjaxIM object instance can exist at a time. This variable
    // can and should be accessed directly.
    
    AjaxIM.client = null;
    
    
    // === {{{AjaxIM.}}}**{{{init(options, actions)}}}** ===
    //
    // Creates the AjaxIM client object and initializes the engine. Here, you can define your
    // options and actions as outlined at the top of this documentation.
    //
    // ==== Parameters ====
    // * {{{options}}} is the hash of custom settings to initialize Ajax IM with.
    // * {{{actions}}} is the hash of any custom action URLs.
    
    AjaxIM.init = function(options, actions) {
        myDebug(debug_trace, 'AjaxIM.init('+options+','+actions+') START', '+');
        if (AjaxIM.client == null) {
            AjaxIM.client = new AjaxIM(options, actions);
            myDebug(debug_trace, 'AjaxIM.client created with AjaxIM.init(...)');
        }
        myDebug(debug_trace, 'AjaxIM.init('+options+','+actions+') END', '-');
        return AjaxIM.client;
    };
    
    
    // === {{{AjaxIM.}}}**{{{request(url, data, successFunc, failureFunc)}}}** ===
    //
    // Wrapper around {{{$.jsonp}}}, the JSON-P library for jQuery, and {{{$.ajax}}},
    // jQuery's ajax library. Allows either function to be called, automatically,
    // depending on the request's URL array (see {{{AjaxIM.actions}}}).
    //
    // ==== Parameters ====
    // {{{url}}} is the URL of the request.
    // {{{data}}} are any arguments that go along with the request.
    // {{{success}}} is a callback function called when a request has completed
    // without issue.
    // {{{_ignore_}}} is simply to provide compatability with {{{$.post}}}.
    // {{{failure}}} is a callback function called when a request hasn't not
    // completed successfully.
    
    AjaxIM.request = function(url, data, successFunc, failureFunc) {
        if (debug_request) myDebug(true, 'AjaxIM.request('+url+','+data+','+successFunc+','+failureFunc+') START', '+');
        if (typeof failureFunc != 'function') {
            failureFunc = function(error){ myDebug(true, error); };
        }
        $[url[0]]({
            'url': url[1],
            'data': data,
            dataType: (url[0] == 'ajax' ? 'json' : 'jsonp'),
            type: 'POST',       // GET is faster than POST according to yahoo technicians
            cache: false,
            timeout: 60000,
            callback: 'jsonp' + (new Date()).getTime(),
            success: function(json, textStatus) {
                successFunc(json);
            },
            error: function(xOptions, error) {
                failureFunc(error);
            }
        });
        
        // This prevents Firefox from spinning indefinitely
        // while it waits for a response. Why? Fuck if I know.
        if (FIREFOX_JSONP_FIX) {
            if (url[0] == 'jsonp' && $.browser.mozilla) {
                $.jsonp({
                    'url': 'about:',
                    timeout: 0
                });
            }
        }
        if (debug_request) myDebug(true, 'AjaxIM.request('+url+','+data+',successFunc,failureFunc) END', '-');
    };
    
    
    // === {{{AjaxIM.}}}**{{{incoming(data)}}}** ===
    //
    // Never call this directly. It is used as a connecting function between
    // client and server for Comet.
    //
    // //Note:// There are two {{{AjaxIM.incoming()}}} functions. This one is a
    // static function called outside of the initialized AjaxIM object; the other
    // is only called within the initalized AjaxIM object.
    
    AjaxIM.incoming = function(data) {
        myDebug(debug_trace || debug_poll, 'AjaxIM.incoming('+data+') START', '+');
        if (! AjaxIM.client) {
            myDebug(debug_poll, 'AjaxIM.client is empty, abort');
            return false;
        }
        if (data.length) {
            myDebug(debug_poll, 'AjaxIM.client._parsMessages('+data+')');
            AjaxIM.client._parseMessages(data);
        }
        myDebug(debug_trace || debug_poll, 'AjaxIM.incoming('+data+') END', '-');
    };
    
    
    // === {{{AjaxIM.}}}**{{{loaded}}}** ===
    //
    // If Ajax IM has been loaded with the im.load.js file, this function will be
    // called when the library is finally loaded and ready for use. Similar to
    // jQuery's $(document).ready(), but for Ajax IM.
    
    // ### not in use. Login, Logout and Login Form Display are queued
    /*
    AjaxIM.loaded = function() {
        myDebug(debug_trace, 'AjaxIM.loaded() START', '+');
        if (typeof AjaxIMLoadedFunction == 'function') {
            AjaxIMLoadedFunction();
            delete AjaxIMLoadedFunction; // clean up the global namespace
        }
        myDebug(debug_trace, 'AjaxIM.loaded() START', '+');
    }
    */
    
    
    // === {{{AjaxIM.}}}**{{{dateFormat([date,] [mask,] utc)}}}** ===
    //
    // Date Format 1.2.3\\
    // &copy; 2007-2009 Steven Levithan ([[http://blog.stevenlevithan.com/archives/date-time-format|stevenlevithan.com]])\\
    // MIT license
    //
    // Includes enhancements by Scott Trenda
    // and Kris Kowal ([[http://cixar.com/~kris.kowal/|cixar.com/~kris.kowal/]])
    //
    // Accepts a date, a mask, or a date and a mask and returns a formatted version
    // of the given date.
    //
    // ==== Parameters ====
    // * {{{date}}} is a {{{Date()}}} object. If not specified, the date defaults to the
    // current date/time.
    // * {{{mask}}} is a string that defines the formatting of the date. Formatting
    // options can be found in the
    // [[http://blog.stevenlevithan.com/archives/date-time-format|Date Format]]
    // documentation. If not specified, the mask defaults to {{{dateFormat.masks.default}}}.
    
    AjaxIM.dateFormat = function () {
        myDebug(debug_trace, 'AjaxIM.dateFormat() START', '+');
        var token = /d{1,4}|m{1,4}|yy(?:yy)?|([HhMsTt])\1?|[LloSZ]|"[^"]*"|'[^']*'/g,
            timezone = new RegExp('\b(?:[PMCEA][SDP]T|(?:Pacific|Mountain|Central|Eastern|Atlantic) ' +
                                  '(?:Standard|Daylight|Prevailing) Time|(?:GMT|UTC)(?:[-+]\d{4})?)\b',
                                  'g'),
            timezoneClip = /[^-+\dA-Z]/g,
            pad = function (val, len) {
                val = String(val);
                len = len || 2;
                while (val.length < len) val = "0" + val;
                return val;
            };
        
        myDebug(debug_trace, 'AjaxIM.dateFormat() END', '-');
        // Regexes and supporting functions are cached through closure
        return function (date, mask, utc) {
            var dF = AjaxIM.dateFormat;
            
            // You can't provide utc if you skip other args (use the "UTC:" mask prefix)
            if (arguments.length == 1 && Object.prototype.toString.call(date) ==
                  "[object String]" && !/\d/.test(date)) {
                mask = date;
                date = undefined;
            }
            
            // Passing date through Date applies Date.parse, if necessary
            date = date ? new Date(date) : new Date;
            if (isNaN(date)) throw SyntaxError("invalid date");
            
            mask = String(dF.masks[mask] || mask || dF.masks["default"]);
            
            // Allow setting the utc argument via the mask
            if (mask.slice(0, 4) == "UTC:") {
                mask = mask.slice(4);
                utc = true;
            }
            
            var _ = utc ? "getUTC" : "get",
                d = date[_ + "Date"](),
                D = date[_ + "Day"](),
                m = date[_ + "Month"](),
                y = date[_ + "FullYear"](),
                H = date[_ + "Hours"](),
                M = date[_ + "Minutes"](),
                s = date[_ + "Seconds"](),
                L = date[_ + "Milliseconds"](),
                o = utc ? 0 : date.getTimezoneOffset(),
                flags = {
                    d:    d,
                    dd:   pad(d),
                    ddd:  AjaxIM.i18n.dayNames[D],
                    dddd: AjaxIM.i18n.dayNames[D + 7],
                    m:    m + 1,
                    mm:   pad(m + 1),
                    mmm:  AjaxIM.i18n.monthNames[m],
                    mmmm: AjaxIM.i18n.monthNames[m + 12],
                    yy:   String(y).slice(2),
                    yyyy: y,
                    h:    H % 12 || 12,
                    hh:   pad(H % 12 || 12),
                    H:    H,
                    HH:   pad(H),
                    M:    M,
                    MM:   pad(M),
                    s:    s,
                    ss:   pad(s),
                    l:    pad(L, 3),
                    L:    pad(L > 99 ? Math.round(L / 10) : L),
                    t:    H < 12 ? "a"  : "p",
                    tt:   H < 12 ? "am" : "pm",
                    T:    H < 12 ? "A"  : "P",
                    TT:   H < 12 ? "AM" : "PM",
                    Z:    utc ? "UTC" :
                            (String(date).match(timezone) || [""])
                            .pop().replace(timezoneClip, ""),
                    o:    (o > 0 ? "-" : "+") +
                            pad(Math.floor(Math.abs(o) / 60) * 100 + Math.abs(o) % 60, 4),
                    S:    ["th", "st", "nd", "rd"][d % 10 > 3 ?
                            0 :
                            (d % 100 - d % 10 != 10) * d % 10]
                };
            
            return mask.replace(token, function ($0) {
                return $0 in flags ? flags[$0] : $0.slice(1, $0.length - 1);
            });
        };
    }();
    
    
    // Some common format strings
    AjaxIM.dateFormat.masks = {
        "default":      "ddd mmm dd yyyy HH:MM:ss",
        shortDate:      "m/d/yy",
        mediumDate:     "mmm d, yyyy",
        longDate:       "mmmm d, yyyy",
        fullDate:       "dddd, mmmm d, yyyy",
        shortTime:      "h:MM TT",
        mediumTime:     "h:MM:ss TT",
        longTime:       "h:MM:ss TT Z",
        isoDate:        "yyyy-mm-dd",
        isoTime:        "HH:MM:ss",
        isoDateTime:    "yyyy-mm-dd'T'HH:MM:ss",
        isoUtcDateTime: "UTC:yyyy-mm-dd'T'HH:MM:ss'Z'"
    };
    
    
    // === {{{AjaxIM.}}}**{{{i18n}}}** ===
    //
    // Text strings used by Ajax IM. Should you want to translate Ajax IM into
    // another language, merely change these strings.
    //
    // {{{%s}}} denotes text that will be automatically replaced when the string is
    // used.
    
    AjaxIM.i18n = {
        dayNames: [
            "Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat",
            "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"
        ],
        monthNames: [
            "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
            "January", "February", "March", "April", "May", "June", "July", "August", "September",
            "October", "November", "December"
        ],
        
        chatOffline: '%s signed off.',
        chatAvailable: '%s became available.',
        chatAway: '%s went away.',
        
        notConnected: 'You are currently not connected or the server is not available. ' +
                      'Please ensure that you are signed in and try again.',
        notConnectedTip: 'You are currently not connected.',
        
        authInvalid: 'Invalid username or password.',
        
        registerPasswordLength: 'Passwords must be more than 4 characters in length.',
        registerUsernameLength: 'Usernames must be more than 2 characters in length and ' +
                        ' contain only A-Z, a-z, 0-9, underscores (_) and periods (.).',
        registerPasswordMatch: 'Entered passwords do not match.',
        registerUsernameTaken: 'The chosen username is already in use; please choose another.',
        registerUnknown: 'An unknown error occurred. Please try again.'
    };
})(jQuery);
