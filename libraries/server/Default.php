<?php
/*
 * Library: Default
 * Author: Joshua Gross
 * Version: 0.1 alpha
 * Date: February 12, 2010
 *
 * Description:
 * The default PHP-only server library. This library allows
 * you to use Ajax IM on a shared server, without installing
 * any extra software.
 *
 * Requirements: Database
 */

// == Default Server Library ==
//
// This is the default PHP-only server library. This library allows you
// to use Ajax IM on a shared server, without installing any extra software.
class Default_IM extends IM
{
    const FIXBUFFER = 1024; // Works around an output buffering issue in IE & Safari
    const FIXEOL = '<br/>'; // Works around an end-of-line issue in Safari

    // === {{{Default_IM::}}}**{{{__construct()}}}** ===
    //
    // Initializes the IM library and retrieves the user's session, if one
    // currently exists.
    function __construct()
    {
        parent::__construct();
        
        session_start();
        if ($_SESSION['username']) {
            $this->username = $_SESSION['username'];
            $this->user_id = $_SESSION['user_id'];
        }
    }
    
    // === {{{Default_IM::}}}**{{{resume()}}}** ===
    //
    // Check if session can be resumed.
    //
	/* does not really work this way, because of asynchronous nature of AJAX. If the session is not ok, it might take too
	long to get the response, and the login process won't be started
    public function resume() {
        if(!empty($_SESSION['username']) && !empty($_SESSION['user_id']) && false) {
            return array('r' => 'connected', 'username' => $_SESSION['username'], 'user_id' => $_SESSION['user_id']);
        } else {
            return array('r' => 'error', 'e' => 'user not stored in session');
        }
    }
	*/
    
    // === {{{Default_IM::}}}**{{{login($username, $password)}}}** ===
    //
    // Authenticate a user against the database. If the user is valid,
    // log them in.
    //
    // ==== Parameters ====
    // * {{{$username}}} is the user's login name.\\
    // * {{{$password}}} is an already-md5'd copy of the user's password.
    public function login($username, $password)
    {
        if (!empty($_COOKIE[COOKIE_NAME]) && !empty($_SESSION['username']) && !empty($_SESSION['user_id']) && $_SESSION['username'] == $username) {
            return array('r' => 'resume');
        } elseif ($user = User::authenticate($username, $password)) {
            // user just logged in, update login time.
            ### we do this now in User::authenticate, and also update the ip address
            ### $user->lastLogin(time());
            
            ### this is problematic !!!
            ### the hosting application might use these session vars !!!
            ### either use unique variable names, e.g. imjs_username or 
            ### move this to MySQL.php, so we set these session vars only in the stand-alone
            ### chat and define a separate function to test if a user is online. The stand-alone chat
            ### would then test these session vars and the application-specific classes will
            ### use application-specific functions to check if a user is online.
            ### Time will tell the wiser after trying it with osDate and joomla.
            ### A big question is: as the hosting app is performing a login, should ajax-im
            ### perform a second login, just to set up the data structures? We could handle this
            ### all with the resume method in the js module.
            $_SESSION['username'] = $user->username;
            $_SESSION['user_id'] = $user->user_id;
            
            $session_id = md5(microtime(true) . $user->username);
            
            $friends = Friend::of($user->user_id);
            
            //replaced with $session, to prepare memcache usage
            $cookie = json_encode(array(
                'user' => $user->username,
                'sid' => $session_id
            ));
            setcookie(COOKIE_NAME, $cookie, time()+(60*60*24*COOKIE_PERIOD), '/', COOKIE_DOMAIN);
            
            /* memcache variant (NOT ALL SERVERS MIGHT SUPPORT MEMCACHE)
            ### not sure if we need to store the friends. friends are updated dynamically with messages or
            ### restored when the page is loaded. well, maybe we won't need to read the DB on a reload.
            $session = array(
                'username' => $user->username,
                'user_id' => intval($user->user_id),
                'session_id' => $session_id,
                'friends' => Friend::of($user->user_id, true)
            );
            $this->memcache->add($user->username, json_encode($session));
            */
            
            ### we could do this in User::authenticate()
            $status = Status::of($user->user_id);
            
            return array('r' => 'logged in', 's' => session_id(), 'u' => $user->username, 's' => $status->status_id, 'f' => $friends,
            'x' => COOKIE_NAME.','.$cookie.','.COOKIE_PERIOD.','.COOKIE_DOMAIN);
        } else {
            return array('r' => 'error', 'e' => 'invalid user');
        }
    }
    
    // === {{{Default_IM::}}}**{{{logout()}}}** ===
    //
    // Signs the user out.
    public function logout()
    {
        session_destroy();
        $_SESSION = array();
        return array('r' => 'logged out');
    }
    
    // === {{{Default_IM::}}}**{{{send($to, $message)}}}** ===
    //
    // Send a message to another user by adding the message to the
    // database.
    //
    // ==== Parameters ====
    // * {{{$to}}} is the username of the recipient.\\
    // * {{{$message}}} is the content.
    public function send($to, $message)
    {
        if (!$this->username) {
            return array('r' => 'error', 'e' => 'no session found');
        }
        $message = $this->_sanitize($message);
        $to = User::find($to);
        if (!$to) {
            return array('r' => 'error', 'e' => 'no_recipient');
        }
        if (Message::send($this->user_id, $to->user_id, $message)) {
            return array('r' => 'sent');
        } else {
            return array('r' => 'error', 'e' => 'send error');
        }
    }
    
    // === {{{Default_IM::}}}**{{{status($status, $message)}}}** ===
    //
    // Sets the status of the current user, including any associated
    // status message.
    public function status($status_id, $message)
    {
        if (!$this->username) {
            return array('r' => 'error', 'e' => 'no session found');
        }
        
        $status_id = intval($status_id);
        $message = $this->_sanitize($message);
        
        $statuses = array(Status::Offline, Status::Available, Status::Away, Status::Invisible);
        
        if (!in_array($status_id, $statuses)) {
            $status_id = Status::Available;
        }
        
        $user_status = new Status($this->user_id);
        
        if ($user_status->is($status_id, $message)) {
            return array('r' => 'status set');
        } else {
            return array('r' => 'error', 'e' => 'status error');
        }
    }
    
    // === {{{Default_IM::}}}**{{{register($username, $password)}}}** ===
    //
    // Create a new user based on the provided username and password.
    //
    // ==== Parameters ====
    // * {{{$username}}} is the new user's login name.\\
    // * {{{$password}}} is the user's plaintext password.
    public function register($username, $password)
    {
        if (preg_match('/^[A-Za-z0-9_.]{3,16}$/', $username)) {
            if (strlen($password) > 3) {
                $db = MySQL_Database::instance();
                $test_username_sql = "SELECT COUNT(user_id) FROM " . MYSQL_PREFIX . "users WHERE username LIKE :username";
                $test_username = $db->prepare($test_username_sql);
                $test_username->execute(array(':username' => $username));
                if (!$test_username->fetchColumn()) {
                    // hash the password
                    $password = md5($password);
                    $pw_str = substr($password, 0, 8);
                    $password = $pw_str . md5($pw_str . $password);
                    
                    $register_sql = "INSERT INTO " . MYSQL_PREFIX . "users
                        (username, password, last_known_ip)
                        VALUES(:username, :password, :ip)";
                    $register = $db->prepare($register_sql);
                    $is_registered = $register->execute(array(
                        ':username' => $username,
                        ':password' => $password,
                        ':ip' => ip2long($_SERVER['REMOTE_ADDR'])
                    ));
                    
                    if($is_registered) {
                        return array('r' => 'registered');
                    } else {
                        return array('r' => 'error', 'e' => 'unknown');
                    }
                } else {
                    return array('r' => 'error', 'e' => 'username taken');
                }
            } else {
                return array('r' => 'error', 'e' => 'invalid password');
            }
        } else {
            return array('r' => 'error', 'e' => 'invalid username');
        }
    }
    
    // === {{{Default_IM::}}}**{{{poll($method)}}}** ===
    //
    // Query the database for any new messages, and respond (or wait)
    // using the specified method (short, long, or comet).
    //
    // ==== Parameters ====
    // * {{{$method}}} is the type of response method to use as a reply.
    // See {{{im.js}}} for a description of each method.
    public function poll($method)
    {
        if (!$this->username) {
            return array('r' => 'error', 'e' => 'no session found');
        }

        session_write_close(); // prevents locking
        
        // If output buffering hasn't been setup yet...
        if (count(ob_list_handlers()) < 2) {
            // Buffer output, but flush always after any output
            ob_start();
            ob_implicit_flush(true);
            
            // Set the headers such that our response doesn't get cached
            header('Expires: Mon, 26 Jul 1997 05:00:00 GMT');
            header('Last-Modified: ' . gmdate('D, d M Y H:i:s') . ' GMT');
            header('Cache-Control: no-store, no-cache, must-revalidate');
            header('Cache-Control: post-check=0, pre-check=0', false);
            header('Pragma: no-cache');
        }
        
        switch($method) {
            case 'long':
                return $this->_longPoll();
            break;
            case 'comet':
                return $this->_comet();
            break;
            default:
            case 'short':
                return $this->_shortPoll();
            break;
        }
    }
    
    // === //private// {{{Default_IM::}}}**{{{_longPoll()}}}** ===
    //
    // Use the long polling technique to check for and deliver new messages.
    private function _longPoll()
    {
        set_time_limit(30); // 30
        
        // We're going to keep a running tally of the number of times
        // we've checked for, but haven't received, messages. As that
        // number increases, the sleep duration will increase.
        
        $no_msg_count = 0;
        $messages = array();
        $start = time();
		
        do {
            $messages = Message::getMany('to', $this->user_id);
            if (empty($messages)) {
                $no_msg_count++;
                sleep(2.5 + min($no_msg_count * 1.5, 7.5));
            }
            //   4.0 (10.0), 5.5 (10.0), 7.0 (10.0), 8.5 (10.0), 10.0, 11.5, 13.0, 14.5
            // 0      10          20          30         
        } while (empty($messages) && time() - $start < 15);

        if ($messages) {
            return $this->_pollParseMessages($messages);
        } else {
            return array('r' => 'no messages');
		}
        /* json streaming approach
        while(true) {
            $messages = Message::getMany('to', $this->user_id);

            if(!$messages) {
                $no_msg_count++;
                sleep(max($no_msg_count * 2, 10));
            }
			else
                // this won't work
				return $this->_pollParseMessages($messages);
        }
        */
    }
    
    // === //private// {{{Default_IM::}}}**{{{_shortPoll()}}}** ===
    //
    // Use the short polling technique to check for and deliver new messages.
    private function _shortPoll()
    {
        $messages = Message::getMany('to', $this->user_id);
        
        if($messages) {
            return $this->_pollParseMessages($messages);
        } else {
            return array('r' => 'no messages');
        }
    }
    
    // === //private// {{{Default_IM::}}}**{{{_comet()}}}** ===
    //
    // Use the comet/streaming technique to check for and deliver new messages.
	// seems all a bit awkward
	// javascript tag is not really executed, but stripped from the response and only the pure javascript commands
	// are executed with eval. this only ads a layer to the callback function. let's try to just stream the json and
	// process it with the ajax callback function. check for connection_abort and start a new ajax request if necessary.
    private function _comet()
    {
        set_time_limit(0);
    
        // First, fix buffers
        echo str_repeat(chr(32), self::FIXBUFFER) . self::FIXEOL , ob_get_clean();

        $no_msg_count = 0;
        while(true) {                
            $messages = Message::getMany('to', $this->user_id);
            if(!$messages) {
                $no_msg_count++;
                // sleep(2.5 + min($no_msg_count * 1.5, 7.5));
                sleep(5);
                echo chr(32), ob_get_clean();
                if(connection_aborted()) return;
            } else {
                $no_msg_count = 0;
                echo '<script type="text/javascript">parent.AjaxIM.incoming(' .
                    json_encode($this->_pollParseMessages($messages)) .
                ');</script>' . self::FIXEOL , ob_get_clean();
                sleep(5);
            }
        }
    }
    
    // === //private// {{{Default_IM::}}}**{{{_pollParseMessages()}}}** ===
    //
    // Parse each message object and return it as an array deliverable to the client.
    //
    // ==== Parameters ====
    // * {{{$messages}}} is the array of message objects.
    private function _pollParseMessages($messages)
    {
        $msg_arr = array();
        foreach ($messages as $msg) {
            $msg_arr[] = array('t' => $msg->type, 's' => $msg->from, 'r' => $msg->to, 'm' => $msg->message);
        }
        return $msg_arr;
    }
    
    // === //private// {{{Default_IM::}}}**{{{_sanitize()}}}** ===
    //
    // Sanitize messages by preventing any HTML tags from being created
    // (replaces &lt; and &gt; entities).
    private function _sanitize($str)
    {
        return str_replace('>', '&gt;', str_replace('<', '&lt;', str_replace('&', '&amp;', $str)));
    }
}

/* End of libraries/server/Default.php */