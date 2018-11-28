function dataService() {
    return new Promise((resolve, reject) => {
        setTimeout(() => {
            resolve('ok')
        }, 500);
    });
}


module.exports = class {

    catchAll() {
        return this.redirect(`${this.options.mountPath}home/index`)
    }

    index() {
        return this.view("index", { title: "mvcexpress" })
    }

    about() {
        /* returning a string that will be rendered by res.send */
        return "I'm about page."
    }

    async promise() {
        await dataService()
        return "promise success!"
    }
}