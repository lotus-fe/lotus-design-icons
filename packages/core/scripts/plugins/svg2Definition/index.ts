import {
  pipe,
  clone,
  map,
  filter,
  where,
  equals,
  gt as greaterThan,
  both,
  unless,
  length,
  dissoc as deleteProp,
  reduce,
  path as get,
  __,
  applyTo,
  defaultTo,
  objOf,
  assoc
} from 'ramda';
import parseXML from '@rgrove/parse-xml';

import { createTrasformStream } from '../creator';

import type{ ThemeType, AbstractNode } from '../../../templates/types';

export interface AbstractNodeDefinition {
  name: string;
  theme: ThemeType;
  icon: AbstractNode;
}

export interface StringifyFn {
  (icon: AbstractNodeDefinition): string;
}

export interface SVG2DefinitionOptions {
  /** 图标的主题风格 */
  theme: ThemeType;
  /** 对节点的额外转换 */
  extraNodeTransformFactories: TransformFactory[];
  /** 在套用模板前，对抽象节点的序列化操作 */
  stringify?: StringifyFn;
}

export interface XML2AbstractNodeOptions extends SVG2DefinitionOptions {
  name: string;
}

export type TransformOptions = Pick<XML2AbstractNodeOptions, 'name' | 'theme'>;

export interface TransformFactory {
  (options: TransformOptions): (asn: AbstractNode) => AbstractNode;
}

// SVG => IconDefinition
export const svg2Definition = ({
  theme,
  extraNodeTransformFactories,
  stringify
}: SVG2DefinitionOptions) =>
  createTrasformStream((SVGString, { stem: name }) =>
    applyTo(SVGString)(
      pipe(
        // 0. The SVG string is like that:
        // <svg viewBox="0 0 1024 1024"><path d="..."/></svg>

        parseXML,

        // 1. The parsed XML root node is with the JSON shape:
        // {
        //   "type": "document",
        //   "children": [
        //     {
        //       "type": "element",
        //       "name": "svg",
        //       "attributes": { "viewBox": "0 0 1024 1024" },
        //       "children": [
        //         {
        //           "type": "element",
        //           "name": "path",
        //           "attributes": {
        //             "d": "..."
        //           },
        //           "children": []
        //         }
        //       ]
        //     }
        //   ]
        // }

        pipe(
          // @todo: "defaultTo" is not the best way to deal with the type Maybe<Element>
          get<Element>(['children', 0]),
          defaultTo(({} as any) as Element)
        ),

        // 2. The element node is with the JSON shape:
        // {
        //   "type": "element",
        //   "name": "svg",
        //   "attributes": { "viewBox": "0 0 1024 1024" },
        //   "children": [
        //     {
        //       "type": "element",
        //       "name": "path",
        //       "attributes": {
        //         "d": "..."
        //       },
        //       "children": []
        //     }
        //   ]
        // }

        element2AbstractNode({
          name,
          theme,
          extraNodeTransformFactories
        }),

        // 3. The abstract node is with the JSON shape:
        // {
        //   "tag": "svg",
        //   "attrs": { "viewBox": "0 0 1024 1024", "focusable": "false" },
        //   "children": [
        //     {
        //       "tag": "path",
        //       "attrs": {
        //         "d": "..."
        //       }
        //     }
        //   ]
        // }

        pipe(
          objOf('icon'),
          assoc('name', name),
          assoc('theme', theme)
        ),
          defaultTo(JSON.stringify)(stringify)
      )
    )
  );

function element2AbstractNode({
  name,
  theme,
  extraNodeTransformFactories
}: XML2AbstractNodeOptions) {

  return ({ name: tag, attributes, children }: Record<string, any>): AbstractNode => {
    return applyTo(extraNodeTransformFactories)(
      pipe(
        map((factory: TransformFactory) => factory({ name, theme })),
        reduce(
          (transformedNode, extraTransformFn) =>
            extraTransformFn(transformedNode),
          applyTo({
            tag,
            attrs: clone(attributes),
            children: applyTo(children)(
              pipe(
                filter<Element, 'array'>(where({ type: equals('element') })),
                map(
                  element2AbstractNode({
                    name,
                    theme,
                    extraNodeTransformFactories
                  })
                )
              )
            )
          })(
            unless<AbstractNode, AbstractNode>(
              where({
                children: both(Array.isArray, pipe(length, greaterThan(__, 0)))
              }),
              deleteProp('children')
            )
          )
        )
      )
    );
  }
}
