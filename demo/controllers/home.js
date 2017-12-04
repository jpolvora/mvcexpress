function dataService() {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve('ok')
        }, 500);
    });
}

module.exports = class {
    constructor(services) {
        this.view = services.view;
    }

    catchAll(req) {
        /* returning a function that accepts res parameter (the response object from express) */
        return function (res) {
            res.send("When an action is not found, the catchAll enters in action.");
        }
    }

    index(req) {
        return this.view("index", { title: "express..." })
    }

    about(req) {
        /* returning a string that will be rendered by res.send */
        return "I'm about page."
    }

    async promise(req) {
        await dataService() 
        return "promise success!"
    }
}