var fs    = require('fs'),
    http  = require('http'),
    https = require('https'),
    cert  = fs.readFileSync(__dirname + '/../../../examples/shared/server.crt'),
    key   = fs.readFileSync(__dirname + '/../../../examples/shared/server.key')

JS.ENV.IntegrationSteps = JS.Test.asyncSteps({
  server: function(port, ssl, callback) {
    this._adapter = new Faye.NodeAdapter({mount: "/bayeux", timeout: 2})
    this._adapter.addExtension({
      outgoing: function(message, callback) {
        if (message.data) message.data.tagged = true
        callback(message)
      }
    })

    this._port = port
    this._secure = ssl

    this._http = ssl
               ? https.createServer({cert: cert, key: key})
               : http.createServer()

    this._adapter.attach(this._http)
    this._http.listen(port, callback)
  },

  stop: function(callback) {
    for (var id in this._clients) this._clients[id].disconnect()
    var self = this
    setTimeout(function() {
      self._http.on('close', callback)
      self._http.close()
    }, 100)
  },

  client: function(name, channels, callback) {
    var scheme = this._secure ? "https" : "http"
    this._clients = this._clients || {}
    this._inboxes = this._inboxes || {}
    this._clients[name] = new Faye.Client(scheme + "://localhost:" + this._port  + "/bayeux", {ca: cert})
    this._inboxes[name] = {}

    var n = channels.length
    if (n === 0) return this._clients[name].connect(callback)

    for (var i = 0; i < n; i++)
      (function(channel) {
        var subscription = this._clients[name].subscribe(channel, function(message) {
          this._inboxes[name][channel] = this._inboxes[name][channel] || []
          this._inboxes[name][channel].push(message)
        }, this)
        subscription.callback(function() {
          n -= 1
          if (n === 0) callback()
        })
      }).call(this, channels[i]);
  },

  publish: function(name, channel, message, callback) {
    this._clients[name].publish(channel, message)
    setTimeout(callback, 100)
  },

  check_inbox: function(name, channel, messages, callback) {
    var inbox = this._inboxes[name][channel] || []
    this.assertEqual(messages, inbox)
    callback()
  }
})

JS.ENV.Server.IntegrationSpec = JS.Test.describe("Server integration", function() { with(this) {
  include(IntegrationSteps)

  sharedExamplesFor("message bus", function() { with(this) {
    before(function() { with(this) {
      server(4180, serverOptions.ssl)
      client("alice", [])
      client("bob", ["/foo"])
    }})

    after(function() { this.stop() })

    it("delivers a message between clients", function() { with(this) {
      publish("alice", "/foo", {hello: "world", extra: null})
      check_inbox("bob", "/foo", [{hello: "world", extra: null, tagged: true}])
    }})

    it("does not deliver messages for unsubscribed channels", function() { with(this) {
      publish("alice", "/bar", {hello: "world"})
      check_inbox("bob", "/foo", [])
    }})

    it("delivers multiple messages", function() { with(this) {
      publish("alice", "/foo", {hello: "world"})
      publish("alice", "/foo", {hello: "world"})
      check_inbox("bob", "/foo", [{hello: "world", tagged: true}, {hello: "world", tagged: true}])
    }})

    it("delivers multibyte strings", function() { with(this) {
      publish("alice", "/foo", {hello: "Apple = "})
      check_inbox("bob", "/foo", [{hello: "Apple = ", tagged: true}])
    }})
  }})

  sharedExamplesFor("network transports", function() { with(this) {
    describe("with HTTP transport", function() { with(this) {
      before(function() { with(this) {
        stub(Faye.Transport.WebSocket, "isUsable").yields([false])
      }})

      itShouldBehaveLike("message bus")
    }})

    describe("with WebSocket transport", function() { with(this) {
      before(function() { with(this) {
        stub(Faye.Transport.WebSocket, "isUsable").yields([true])
      }})

      itShouldBehaveLike("message bus")
    }})
  }})

  describe("with HTTP server", function() { with(this) {
    before(function() { with(this) {
      this.serverOptions = {ssl: false}
    }})

    itShouldBehaveLike("network transports")
  }})

  describe("with HTTPS server", function() { with(this) {
    before(function() { with(this) {
      this.serverOptions = {ssl: true}
    }})

    itShouldBehaveLike("network transports")
  }})
}})

