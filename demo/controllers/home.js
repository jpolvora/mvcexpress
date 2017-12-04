function view(viewName, model) {
    return function(res) {
        res.render(viewName, model);
    }
}

module.exports = function (routeInfo) {
    return {
        catchAll: (req) => {
            /* returning a function that accepts res parameter (the response object from express) */
            return function (res) {
                res.send("When an action is not found, the catchAll enters in action.");
            }
        },

        index: (req) => {
           return view("index", { title: "express..." })
        },

        about: (req) => {
            /* returning a string that will be rendered by res.send */
            return "I'm about page."
        }
    }
}