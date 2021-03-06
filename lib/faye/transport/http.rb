module Faye

  class Transport::Http < Transport
    def self.usable?(client, endpoint, &callback)
      callback.call(URI === endpoint)
    end

    def encode(messages)
      Faye.to_json(messages)
    end

    def request(messages)
      content = encode(messages)
      params  = build_params(@endpoint, content)
      request = create_request(params)

      request.callback do
        handle_response(request.response, messages)
        store_cookies(request.response_header['SET_COOKIE'])
      end

      request.errback do
        @client.message_error(messages)
      end
    end

  private

    def build_params(uri, content)
      {
        :head => {
          'Content-Length'  => content.bytesize,
          'Content-Type'    => 'application/json',
          'Cookie'          => get_cookies,
          'Host'            => uri.host
        }.merge(@client.headers),

        :body    => content,
        :timeout => -1  # for em-http-request < 1.0
      }
    end

    def create_request(params)
      version = EventMachine::HttpRequest::VERSION.split('.')[0].to_i
      client  = if version >= 1
                  options = {                 # for em-http-request >= 1.0
                    :inactivity_timeout => 0  # connection inactivity (post-setup) timeout (0 = disable timeout)
                  }
                  EventMachine::HttpRequest.new(@endpoint.to_s, options)
                else
                  EventMachine::HttpRequest.new(@endpoint.to_s)
                end

      client.post(params)
    end

    def handle_response(response, messages)
      message = MultiJson.load(response) rescue nil
      if message
        receive(message)
      else
        @client.message_error(messages)
      end
    end
  end

  Transport.register 'long-polling', Transport::Http

end
