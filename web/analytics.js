var ___signal = (function() {

  function Signal() {}

  Signal.prototype.init = function(tracking_id, options) {
    if (window.$signal) {
      // already initialized
      return
    }
    if (!options) {
      options = {};
    }

    var aid = this._get_cookie('_signal');
    var events = [];
    if (window.localStorage) {
      this.localStorage = window.localStorage;
      var oldEvents = this.localStorage.getItem('_signal_events');
      if (oldEvents) {
        events = JSON.parse(oldEvents);
      } else {
        events = [];
      }
    }

    this.tracking_id = tracking_id;
    this.api_endpoint = options.history_hash_mode || 'http://localhost:9090';
    this.history_hash_mode = options.history_hash_mode || false;
    this.debug = options.debug || false;
    this.events = events;
    if (!aid) {
      aid = this._uuid();
      this._set_cookie('_signal', aid);
    }
    this.aid = aid;
    this.location = '';
    this._track_page();

    setInterval(this._track_page_change.bind(this), 200);

    //listen for link click events at the document level
    if (document.addEventListener) {
      document.addEventListener('click', this._intercept_click.bind(this), true);
      document.addEventListener('submit', this._intercept_submit.bind(this), true);
      document.addEventListener('beforeunload', this._intercept_beforunload.bind(this), true);
    } else if (document.attachEvent) {
      document.attachEvent('onclick', this._intercept_click.bind(this));
      document.attachEvent('onsubmit', this.intercept_submit.bind(this));
    }
    setInterval(this.flush.bind(this), 2000);
    window.$signal = this;
  }


  Signal.prototype.track = function(event_name, payload, cb) {
    var event = {
      name: event_name,
      payload: payload,
    };

    this._push_event('track', event);
    if (cb) {
      cb();
    }
  }

  Signal.prototype.reset = function() {
  }

  Signal.prototype.identify = function(id) {
    var event = {
      id: id,
    };

    this._push_event('identify', event);
  }

  Signal.prototype.flush = function(cb) {
    if (this.events.length !== 0) {
      if (this.debug) {
        console.log(this.events);
      }
      var that = this;
      this._send_events(function() {
        that.events = [];
        if (that.localStorage) {
          that.localStorage.removeItem('_signal_events');
        }
        if (cb) {
          cb();
        }
      });
    }
  }


  Signal.prototype._get_page = function() {
    return {
      // session related
      referrer: document.referrer,
      device: {
        w: screen.width,
        h: screen.height,
      },
      // page related
      domain: window.location.hostname,
      path: window.location.pathname,
      hash:  window.location.hash,
      title: document.title,
      query: window.location.search,
      url: window.location.href,
    };
  }

  Signal.prototype._track_page = function() {
    var page = this._get_page();

    if (this.history_hash_mode === true) {
      this.location = page.hash;
    } else {
      this.location = page.path;
    }

    this._push_event('page_view', page);
  }


  Signal.prototype._uuid = function() {
    var uuid = "", i, random;
    for (i = 0; i < 32; i++) {
      random = Math.random() * 16 | 0;

      if (i == 8 || i == 12 || i == 16 || i == 20) {
        uuid += "-"
      }
      uuid += (i == 12 ? 4 : (i == 16 ? (random & 3 | 8) : random)).toString(16);
    }
    return uuid;
  }

  Signal.prototype._push_event = function(event_type, data) {
    var event = {
      timestamp: new Date().getTime(),
      tid: this.tracking_id,
      type: event_type,
      aid: this.aid,
      data: data,
    };
    this.events.push(event);
    if (this.localStorage) {
      this.localStorage.setItem('_signal_events', JSON.stringify(this.events));
    }
  }

  Signal.prototype._send_events = function(cb) {
    /*
    var request = null;

    if (window.XMLHttpRequest) {
  // code for modern browsers
      request = new XMLHttpRequest();
    } else {
      // code for old IE browsers
      request = new ActiveXObject("Microsoft.XMLHTTP");
    }

    var endpoint = this.api_endpoint+'/events';

    request.open('POST', endpoint, true);
    request.setRequestHeader('Content-Type', 'application/json');

    var that = this;
    request.onreadystatechange = function() {
      if (this.readyState === 4) {
        if (that.debug) {
          console.log('signal: status=', this.status);
          console.log('signal: data=', this.responseText);
        }
        if (cb) {
          cb();
        }
      }
    };

    request.send(JSON.stringify(this.events));
    request = null;
    */
      var img = new Image()
      img.src = this.api_endpoint + '/pixel?events='+this._encode_pixel_data(JSON.stringify(this.events));
      img.style.display = 'none'
      document.body.appendChild(img)
      this.events = [];
      cb();
    }


  Signal.prototype._intercepted = function(e) {
    var event = {
      page: this._get_page(),
      target: {
        href: null,
        text: null,
        class: null,
        id: null,
        tag: null,
      }
    };

    if (e.target !== null && typeof e.target === 'object') {
      var target = e.target;
      if (typeof target.href === 'string') {
        event.target.href = target.href;
      }
      if (typeof target.id === 'string') {
        event.target.id = target.id;
      }
      if (typeof target.tagName === 'string') {
        event.target.tag = target.tagName.toLowerCase();
      }
      if (typeof target.className === 'string') {
        event.target.class = target.className;
      }
      if (typeof target.innerText === 'string') {
        event.target.text = target.innerText;
      }
    }
    return event;
  }

  Signal.prototype._intercept_click = function(e) {
    this._push_event('click', this._intercepted(e));
  }

  Signal.prototype._intercept_submit = function(e) {
    this._push_event('submit', this._intercepted(e));
    this.flush(function() { event.target.submit(); });

    event.preventDefault();
    return false;
  }

  Signal.prototype._intercept_beforunload = function(e) {
    this.flush();
    return;
  }

  Signal.prototype._encode_pixel_data = function(str) {
    return encodeURIComponent(window.btoa((unescape(encodeURIComponent(str)))));
  }


  Signal.prototype._track_page_change = function() {
    var current_page = window.location.pathname;

    if (this.history_hash_mode === true) {
      current_page += window.location.hash;
    }

    if (this.location !== current_page) {
      this._track_page();
    }
  }

  Signal.prototype._set_cookie = function(name,value,days) {
    var expires = "";
    var date = new Date();
    if (days) {
      date.setTime(date.getTime() + (days*24*60*60*1000));
    } else {
      date.setTime(date.getTime() + (1000*12*30*24*60*60*1000));
    }
    expires = "; expires=" + date.toUTCString();
    document.cookie = name + "=" + (value || "")  + expires + "; path=/";
  }

  Signal.prototype._get_cookie = function(name) {
    var nameEQ = name + "=";
    var ca = document.cookie.split(';');
    for(var i=0;i < ca.length;i++) {
      var c = ca[i];
      while (c.charAt(0)==' ') c = c.substring(1,c.length);
      if (c.indexOf(nameEQ) == 0) return c.substring(nameEQ.length,c.length);
    }
    return null;
  }

  Signal.prototype._delete_cookie = function(name) {
    document.cookie = name+'=; Max-Age=-99999999;';
  }

  if (typeof module === 'undefined') {
    // browser
    new Signal().init('{{.ID}}');
  } else {
    return Signal;
  }
}());

if (typeof module !== 'undefined' && module.exports) {
  module.exports = ___signal;
}
