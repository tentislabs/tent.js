def run(input, tent):
    return tent.call("weather.today", {"city": input["city"]})
