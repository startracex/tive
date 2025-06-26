import { AttributeRegistry } from "../registry.js";
import { AttributeHandler } from "./attribute.js";
import { BooleanAttrHandler } from "./boolean.js";
import { EventHandler } from "./event.js";
import { PropertyHandler } from "./property.js";

export const builtinAttributeRegistry = new AttributeRegistry();
builtinAttributeRegistry.register(BooleanAttrHandler, EventHandler, PropertyHandler, AttributeHandler);
