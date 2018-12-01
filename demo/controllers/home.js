function dataService () {
  return new Promise((resolve, reject) => {
    setTimeout(() => {
      resolve('ok');
    }, 500);
  });
}

let maybe = false;

module.exports = class {
  constructor () {
    // this.registerFilter("MyCustomFilter?");
    var self = this;
    this.authorize = () => {
      // set the user permissions
      maybe = !maybe;
      return new Promise((resolve) => {
        self.authorized = maybe; // fake
        return resolve(true);
      });
    };
  }

  // canExecute(selectedActionName, actionName) {
  //   return this.authorized || selectedActionName === "about";
  // }

  index () {
    var self = this;
    return self.authorize().then(() => {
      console.log(self.authorized);
      if (self.authorized) return this.view('index', { title: 'mvcexpress: is authorized' });
      return 'i am not authorized!';
    });

    // const { username } = this.req.fields;
    // return this.handleDataWithService(new dataService(username));
    // return this.view('index', { title: 'mvcexpress' });
  }

  about () {
    /* returning a string that will be rendered by res.send */
    return "I'm about page.";
  }

  async promise () {
    await dataService();
    return 'promise success!';
  }

  catchAll () {
    return this.redirect(`${this.options.mountPath}home/index`);
  }
};
