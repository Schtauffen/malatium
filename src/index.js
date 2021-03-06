// Malatium
function Malatium (m, store, Component, ...args) {
    if (!m || !store || !store.getState) throw new Error("Mithril and Redux store are required")
    Malatium.m = m
    Malatium.store = store
    return typeof Component === 'function'
        ? new Component(...args)
	: Component
}

// helper functions
export const isArray = function (arr) {
  return Object.prototype.toString.call(arr) === "[object Array]"
}

export const isFunction = function (fn) {
  return typeof fn === "function"
}

export const isObject = function (obj) {
  return obj === Object(obj)
}

export const isComponent = function (component) {
  return isObject(component) && isFunction(component.view) 
}

export const nestComponents = function (...components) {
  return components.reduce((out, component, idx) => {
    if (out === false) return Malatium.m.component(component)
    return Malatium.m.component(component, {}, out)
  }, false)
}

export const identity = x => x 

export const lazyInit = (component) => {
  return isFunction(component) ? new component : component
}

function bindActions (actions, dispatch) {
  if (typeof actions === "function") return actions(dispatch)
  if (typeof actions === "object") return Object.keys(actions).reduce((out, key, index) => {
    if (typeof actions[key] === "function")
      out[key] = (...factoryArgs) => (...args) => {
        return dispatch(actions[key](...factoryArgs, ...args))
      }
    else if (typeof actions[key] === "object")
      out[key] = actions[key]
    return out
  }, {})
  return {}
}

function wrapView (comp, actionMap) {
  const originalView = comp.view
  comp.view = (ctrl, ...args) => {
    let nc = {...ctrl, ...actionMap}
    return originalView(nc, ...args)
  }
}

// connect
const keyNames = /\[[^\]]+\]|[^\.\[]+/g
const bracketed = /^\[[^\]]\]$/
export function findDeep (result, selectors) {
  for (let sel of selectors) {
    if (sel.match(bracketed)) {
      sel = parseInt(sel.substring(1, sel.length - 1), 10)
    }
    if (typeof result[sel] === 'undefined') {
      result = undefined
        break
    }
    result = result[sel]
  } 
  return result
}

export const connect = (selector = identity, actions, mergeProps) => (Component) => ({
  view (controller, props, children) {
    const { dispatch, getState } = Malatium.store 
    let state = {}

    if (typeof selector === 'string') {
      const matches = selector.match(keyNames)
      state.state = findDeep(getState(), matches)
    } else {
      // else we assume function
      state = selector(getState()) 
    }

    const component = lazyInit(Component) 
    let actionMap = {}

    if (typeof actions === 'function') {
      actionMap = actions(dispatch)
    } else if (typeof actions === 'object') {
      actionMap = bindActions(actions, dispatch)
    }
    wrapView(component, actionMap)

    return Malatium.m.component(component, { ...props, dispatch, ...state, ...actionMap, ...mergeProps }, children)
  }
})

// redraw middleware
export const redrawMiddleware = (store) => (next) => (action) => {
  next(action)
  if (action.redraw && Malatium.m && Malatium.m.redraw) Malatium.m.redraw()
}

// routing
const special = ["$container", "$alias", "$default"]
const trimRightSlash = (str) => str.replace(/\/$/, "")

export const flattenRoutes = function (routes, obj = {}, prefix = "", ...parents) {
  if (isFunction(routes)) routes = routes()

  if (isComponent(routes)) {
    obj[trimRightSlash(prefix)] = nestComponents(routes, ...parents)
    return routes 
  }

  if (!isObject(routes)) throw new Error("routes needs to be an object, or function that returns an object")

  if (routes.hasOwnProperty("$container")) {
    const $container = isFunction(routes.$container) ? routes.$container() : routes.$container
    parents = [$container, ...parents]
  }

  Object.keys(routes).forEach((key, idx) => {
    if (special.indexOf(key) > -1) return
    let value = routes[key]

    if (isFunction(value)) value = value()
    if (isArray(value)) throw new Error("not set up to handle arrays")
    if (isComponent(value)) return (obj[trimRightSlash(prefix + key)] = nestComponents(value, ...parents))
    if (isObject(value)) return flattenRoutes(value, obj, prefix + key, ...parents)
    throw new Error("type not handled")
  })

  if (routes.hasOwnProperty("$default")) flattenRoutes(routes.$default, obj, prefix + "/:stub...", ...parents)

  return obj
}

export default Malatium
