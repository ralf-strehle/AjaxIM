// Modifications by Ralf Strehle (ralf.strehle@yahoo.de) May 2010

// Automatically load dependencies, in order, if they aren't already loaded.
// Each array is: [filename, deptest] where deptest is the function to
// test for the dependency.

// CONFIG START
var nodehost = '';                  // set when using NODE server
var load_dependencies = false;      // not really supported. better add all javascript libraries manually to <head> in right order
var INTERVAL = 2500;                // poll interval in milliseconds. when using long polling, this is the interval between 2 long polling calls. the long poll backend is having it's own interval.
var FIREFOX_JSONP_FIX = true;       // tries to stop firefox from display "loading ..." but does not work for me
// CONFIG END

var tagsrc = (thistag = document.getElementsByTagName('script'))[thistag.length-1].src;
var jsfolder = tagsrc.replace(/im.load.js([?].+)?/, '');
var imfolder = jsfolder.replace(/js\/$/, '');

if (load_dependencies) {
    var head = document.getElementsByTagName('head')[0];
    // problem with detection of jquery.jstore-all-min.js (always loaded, because minified code cannot be detected)
    var dependencies = [
        ['jquery-1.4.2.min.js', function() { return (typeof window['jQuery'] != 'undefined'); }],
        ['jquery.jsonp-1.1.3.min.js', function() { return (typeof jQuery['jsonp'] != 'undefined'); }],
        ['jquery.jstore-all-min.js', function() { return (typeof jQuery['jstore'] != 'undefined'); }],
        ['jquery.md5.js', function() { return (typeof jQuery['md5'] != 'undefined'); }],
        ['im.js', function() { return (typeof AjaxIM != 'undefined'); }]
    ];
    
    (loadDep = function (depPos) {
        if (depPos >= dependencies.length) { init(); return; }
        var dep = dependencies[depPos];
        if (!dep[1]()) {
            if (debug) alert("append "+dep[0]);
            var newdep = document.createElement('script');
            newdep.type = 'text/javascript';
            newdep.src = jsfolder + dep[0];
            alert(newdep.src);
            var nextdep = function() { loadDep(depPos + 1); };
            newdep.onload = nextdep;
            newdep.onreadystatechange = nextdep;
            head.appendChild(newdep);
        } else {
            if (debug) alert("skip "+dep[0]);
            loadDep(depPos + 1);
        }
    })(0);
} else {
    init();
}

function init() {
    if (tagsrc.match(/[?]php$/)) {
        AjaxIM.init({
            pollServer: imfolder + 'ajaxim.php',
            theme: imfolder + 'themes/default',
            loadTheme: false,
            flashStorage: jsfolder + 'jStore.Flash.html'
        });
        //AjaxIM.client.login(AjaxIM_login, AjaxIM_password);
    } else if(tagsrc.match(/[?]node$/)) {
        AjaxIM.init({
            pollServer: imfolder + 'ajaxim.php',
            theme: imfolder + 'themes/default',
            loadTheme: false,
            flashStorage: jsfolder + 'jStore.Flash.html'
        }, {
            poll: 'http://' + nodehost + '/poll',
            send: 'http://' + nodehost + '/send',
            status: 'http://' + nodehost + '/status',
            resume: 'http://' + nodehost + '/resume'
        });
    } else if(tagsrc.match(/[?]guest$/)) {
        AjaxIM.init({
            pollServer: imfolder + 'ajaxim.php',
            theme: imfolder + 'themes/default',
            loadTheme: false,
            flashStorage: jsfolder + 'jStore.Flash.html'
        }, {
            poll: 'http://' + nodehost + '/poll',
            send: 'http://' + nodehost + '/send',
            status: 'http://' + nodehost + '/status',
            resume: 'http://' + nodehost + '/resume'
        });
        AjaxIM.client.login();
    }
}
