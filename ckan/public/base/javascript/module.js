this.ckan = this.ckan || {};

/* The module system ties JavaScript code to elements on the page. A module is
 * simply a function that receives an element and a sandboxed module object.
 *
 * The sandbox provides useful methods for querying within the module element
 * as well as making ajax calls and talking to other modules. The idea being to
 * isolate a single component from the rest of the page keeping the codebase
 * very modular and reusable.
 *
 * Modules are initialized through the DOM keeping boilerplate setup code to a
 * minimum. If an element in the page has a "data-module" attribute then an
 * instance of that module (if registered) will be created when the page loads
 * and will receive the element and the sandbox mentioned above.
 *
 * Examples
 *
 *   // For element: <select data-module="language-picker"></select>
 *
 *   // Register a new module object, .initialize() is called on load.
 *   ckan.module('language-picker', {
 *     initialize: function () {
 *       var el = this.el;
 *       var sandbox = this.sandbox;
 *       var _ = this.sandbox.translate;
 *
 *       // .el is the dom node the element was created with.
 *       this.el.on('change', function () {
 *
 *         // Publish the new language so other modules can update.
 *         sandbox.publish('lang', this.selected);
 *
 *         // Display a localized notification to the user.
 *         // NOTE: _ is an alias for sb.translate()
 *         sandbox.notify(_('Language changed to: ' + this.selected).fetch());
 *       });
 *
 *       // listen for other updates to lang.
 *       sandbox.subscribe('lang', function (lang) {
 *         // Update the element select box.
 *         el.select(lang);
 *       });
 *     }
 *   });
 *
 *   // Can also provide a function that returns this object. The function will
 *   // be passed jQuery, i18n.translate() and i18n objects. This can save
 *   // typing when using these objects a lot.
 *   ckan.module('language-picker', function (jQuery, translate, i18n) {
 *     return {
 *       // Module code.
 *     }
 *   });
 */
(function (ckan, $, window) {
  // Prefixes for the HTML attributes use to pass options into the modules.
  var MODULE_PREFIX = 'data-module';
  var MODULE_OPTION_PREFIX = 'data-module-';

  /* BaseModule is the core of the CKAN website. It represents a single element
   * in the current document and is used to add functionality to that element.
   *
   * I should not be used itself but rather subclasses using the ckan.module()
   * method.
   *
   * It receives a sandbox element with various libraries and utility functions
   * and should use this rather than the global objects (jQuery for instance)
   * as it makes the modules much easier to test.
   *
   * The options property can be used to set defaults, these can be overridden
   * by the user through data-* attributes on the element.
   *
   * element - An element that the sandbox is bound to.
   * options - An object of key/value pairs.
   * sandbox - A sandbox instance.
   *
   * Returns a new BaseModule instance.
   */
  function BaseModule(el, options, sandbox) {
    this.el = el instanceof $ ? el : $(el);
    this.options = $.extend(true, {}, this.options, options);
    this.sandbox = sandbox;
  }

  $.extend(BaseModule.prototype, {
    /* The jQuery element for the current module */
    el: null,

    /* The options object passed into the module either via data-* attributes
     * or the default settings.
     */
    options: null,

    /* A scoped find function restricted to the current scope. */
    $: function (selector) {
      return this.el.find(selector);
    },

    /* Should be defined by the extending module to provide initialization
     * code. This will be called directly after the instance has been
     * invoked.
     */
    initialize: function () {},

    /* Called just before the element is removed from the DOM, use it to
     * un-subscribe any listeners and clean up memory.
     *
     * Examples
     *
     *   teardown: function () {
     *     this.sandbox.unsubscribe('lang', this.onLangChange);
     *     this.sandbox.unsubscribe('login', this.onLogin);
     *   }
     *
     * Returns nothing.
     */
    teardown: function () {},

    /* Removes the module element from the document.
     *
     * Returns nothing.
     */
    remove: function () {
      this.teardown();
      this.el.remove();
    }
  });

  /* Add a new module to the registry.
   *
   * This expects an object of methods/properties to be provided. These will
   * then be used to create a new BaseModule subclass which will be invoked each
   * time that a module appears on the page.
   *
   * name       - A unique name for the module to be registered.
   * properties - An object of module properties or a function that returns
   *              an object.
   *
   * Examples
   *
   *   ckan.module('like-button', {
   *     options: {
   *        endpoint: '/api/v2/like'
   *     },
   *     initialize: function () {
   *       var options = this.options,
   *           sandbox = this.sandbox,
   *           _ = sandbox.translate;
   *
   *       this.el.on('click', function () {
   *         var url = options.endpoint;
   *         var message = _('Dataset was liked!').fetch();
   *         sandbox.ajax( ... );
   *       });
   *     }
   *   });
   *
   * Returns the ckan object.
   */
  function module(name, properties) {
    if (module.registry[name]) {
      throw new Error('There is already a module registered as "' + name  + '"');
    }

    // If a function is provided then call it to get a returns object of
    // properties.
    if (typeof properties === 'function') {
      properties = properties($, ckan.i18n.translate, ckan.i18n);
    }

    // Provide a named constructor, this helps with debugging in the Webkit
    // Web Inspector.
    properties = $.extend({
      constructor: function Module() {
        BaseModule.apply(this, arguments);
      }
    }, properties);

    // Extend the instance.
    module.registry[name] = $.inherit(BaseModule, properties, {namespace: name});

    return ckan;
  }

  /* Holds all of the registered module functions */
  module.registry = {};

  /* Holds all initialized instances */
  module.instances = {};

  /* Searches the document for modules and initializes them. This should only
   * be called once on page load.
   *
   * Examples
   *
   *   jQuery.ready(ckan.module.initialize);
   *
   * Returns the module object.
   */
  module.initialize = function () {
    var registry = module.registry;

    $('[data-module]', document.body).each(function () {
      var name = this.getAttribute(MODULE_PREFIX);
      var Module = registry[name];

      if (Module && typeof Module === 'function') {
        module.createInstance(Module, this);
      }
    });

    return module;
  };

  /* Creates a new module instance for the element provided.
   *
   * The module factory is called with the sandbox, options object and
   * translate function as arguments. In the same way as a jQuery callback the
   * scope of the factory is set to the element the module is bound to.
   *
   * factory - The module factory function to call.
   * element - The element that created the module.
   *
   * Examples
   *
   *   module.createInstance(function (sb, opts, _) {
   *     this  === sb.el[0];     // The div passed in as the second arg.
   *     opts  === sb.opts;      // Any data-module-* options on the div.
   *     _     === sb.translate; // A translation function.
   *   }, document.createInstance('div'));
   *
   * Returns nothing.
   */
  module.createInstance = function (Module, element) {
    var options  = module.extractOptions(element);
    var sandbox  = ckan.sandbox(element, options);

    var instance = new Module(element, options, sandbox);

    if (typeof instance.initialize === 'function') {
      instance.initialize();
    }

    var instances = module.instances[Module.name] || [];
    instances.push(instance);
    module.instances[Module.namespace] = instances;
  };

  /* Extracts any properties starting with MODULE_OPTION_PREFIX from the
   * element and returns them as an object.
   *
   * Keys with additonal hyphens will be converted to camelCase. Each attribute
   * will be passed to JSON.parse() so that complex object can be provided as
   * options (although this is not recommended).
   *
   * element - The element from which to extract the attributes.
   *
   * Examples
   *
   *   // Source <div data-module-url="http://..." data-module-full-name="fred">
   *
   *   module.extractOptions(div); //=> {url: "http://...", fullName: "fred"}
   *
   * Returns an object of extracted options.
   */
  module.extractOptions = function (element) {
    var attrs = element.attributes;
    var index = 0;
    var length = attrs.length;
    var options = {};
    var prop;
    var attr;
    var value;

    for (; index < length; index += 1) {
      attr = attrs[index];

      if (attr.name.indexOf(MODULE_OPTION_PREFIX) === 0) {
        prop = attr.name.slice(MODULE_OPTION_PREFIX.length);

        // Attempt to parse the string as JSON. If this fails then simply use
        // the attribute value as is.
        try {
          value = $.parseJSON(attr.value);
        } catch (error) {
          if (error instanceof window.SyntaxError) {
            value = attr.value;
          } else {
            throw error;
          }
        }

        options[$.camelCase(prop)] = value;
      }
    }

    return options;
  };

  ckan.module = module;
  ckan.module.BaseModule = BaseModule;

})(this.ckan, this.jQuery, this);
