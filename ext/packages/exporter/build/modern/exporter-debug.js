Ext.define('Ext.overrides.exporter.util.Format', {
    override: 'Ext.util.Format',
    /**
     * Transform an integer into a string in hexadecimal.
     *
     * @param {Number} dec The number to convert.
     * @param {Number} bytes The number of bytes to generate.
     * @return {String} The result.
     */
    decToHex: function(dec, bytes) {
        var hex = '',
            i;
        // this method uses code from https://github.com/Stuk/jszip
        for (i = 0; i < bytes; i++) {
            hex += String.fromCharCode(dec & 255);
            dec = dec >>> 8;
        }
        return hex;
    }
});

/**
 * Base class for data object.
 */
Ext.define('Ext.exporter.data.Base', {
    requires: [
        'Ext.util.Collection'
    ],
    config: {
        /**
         * @cfg {String} idPrefix
         *
         * Prefix to use when generating the id.
         *
         * @private
         */
        idPrefix: 'id',
        /**
         * @cfg {String} id
         *
         * Unique id for this object. Auto generated when missing.
         */
        id: null,
        /**
         * @cfg {Boolean} autoGenerateId
         *
         * Set to `true` to auto generate an id if none is defined.
         */
        autoGenerateId: true
    },
    // keep references to internal collections to easily destroy them
    internalCols: null,
    clearPropertiesOnDestroy: false,
    constructor: function(config) {
        var me = this;
        me.internalCols = [];
        me.initConfig(config);
        if (!me._id) {
            me.setId(null);
        }
        return me.callParent([
            config
        ]);
    },
    destroy: function() {
        this.destroyCollections();
        this.callParent();
        this.internalCols = null;
    },
    destroyCollections: function() {
        var cols = this.internalCols,
            len = cols.length,
            i, j, length, col;
        for (i = 0; i < len; i++) {
            col = cols[i];
            length = col.length;
            for (j = 0; j < length; j++) {
                col.items[j].destroy();
            }
            col.destroy();
        }
        cols.length = 0;
    },
    clearCollections: function(cols) {
        var i, len, col;
        cols = cols ? Ext.Array.from(cols) : this.internalCols;
        len = cols.length;
        for (i = len - 1; i >= 0; i--) {
            col = cols[i];
            if (col) {
                col.destroy();
            }
            Ext.Array.remove(this.internalCols, col);
        }
    },
    applyId: function(data) {
        var id;
        if (!data && this._autoGenerateId) {
            id = this._idPrefix + (++Ext.idSeed);
        } else {
            id = data;
        }
        return id;
    },
    /**
     * This method could be used in config appliers that need to initialize a
     * Collection that has items of type className.
     *
     * @param data
     * @param dataCollection
     * @param className
     * @return {Ext.util.Collection}
     */
    checkCollection: function(data, dataCollection, className) {
        var col;
        if (data) {
            col = this.constructCollection(className);
            col.add(data);
        }
        if (dataCollection) {
            Ext.Array.remove(this.internalCols, dataCollection);
            Ext.destroy(dataCollection.items, dataCollection);
        }
        return col;
    },
    /**
     * Create a new Collection with a decoder for the specified className.
     *
     * @param className
     * @returns {Ext.util.Collection}
     *
     * @private
     */
    constructCollection: function(className) {
        var cls = Ext.ClassManager.get(className),
            cfg = {
                decoder: this.getCollectionDecoder(cls)
            },
            col;
        if (typeof cls.prototype.getKey === 'function') {
            cfg.keyFn = this.getCollectionItemKey;
        }
        col = new Ext.util.Collection(cfg);
        this.internalCols.push(col);
        return col;
    },
    /**
     * Builds a Collection decoder for the specified className.
     *
     * @param klass
     * @returns {Function}
     *
     * @private
     */
    getCollectionDecoder: function(klass) {
        return function(config) {
            return (config && config.isInstance) ? config : new klass(config || {});
        };
    },
    /**
     * Returns a collection item key
     *
     * @param item
     * @return {String}
     *
     * @private
     */
    getCollectionItemKey: function(item) {
        return item.getKey ? item.getKey() : (item._id || item.getId());
    }
});

/**
 * This class implements a table column definition
 */
Ext.define('Ext.exporter.data.Column', {
    extend: 'Ext.exporter.data.Base',
    config: {
        /**
         * @cfg {Ext.exporter.data.Table} table
         *
         * Reference to the parent table object
         *
         * @private
         */
        table: null,
        /**
         * @cfg {String} text
         *
         * Column's text header
         *
         */
        text: null,
        /**
         * @cfg {Ext.exporter.file.Style} style
         *
         * Column's style. Use this to add special formatting to the exported document.
         *
         */
        style: null,
        /**
         * @cfg {Number} width
         *
         * Column's width
         *
         */
        width: null,
        /**
         * @cfg {Number} mergeAcross
         *
         * Specifies how many cells need to be merged from the current position to the right
         *
         * @readOnly
         */
        mergeAcross: null,
        /**
         * @cfg {Number} mergeDown
         *
         * Specifies how many cells need to be merged from the current position to the bottom
         *
         * @readOnly
         */
        mergeDown: null,
        /**
         * @cfg {Number} level
         *
         * Column's level
         *
         * @readOnly
         */
        level: 0,
        /**
         * @cfg {Number} index
         *
         * Column's index
         *
         * @readOnly
         */
        index: null,
        /**
         * @cfg {Ext.exporter.data.Column[]} columns
         *
         * Collection of children columns
         *
         */
        columns: null
    },
    destroy: function() {
        this.setTable(null);
        this.callParent();
    },
    updateTable: function(table) {
        var cols = this.getColumns(),
            i, length;
        if (cols) {
            length = cols.length;
            for (i = 0; i < length; i++) {
                cols.getAt(i).setTable(table);
            }
        }
    },
    applyColumns: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.data.Column');
    },
    updateColumns: function(collection, oldCollection) {
        var me = this;
        if (oldCollection) {
            oldCollection.un({
                add: me.onColumnAdd,
                remove: me.onColumnRemove,
                scope: me
            });
            Ext.destroy(oldCollection.items, oldCollection);
        }
        if (collection) {
            collection.on({
                add: me.onColumnAdd,
                remove: me.onColumnRemove,
                scope: me
            });
            me.onColumnAdd(collection, {
                items: collection.getRange()
            });
        }
    },
    sync: function(level, depth) {
        var me = this,
            count = me.getColumnCount() - 1,
            cols = me.getColumns(),
            i, length, down;
        me.setLevel(level);
        if (cols) {
            length = cols.length;
            for (i = 0; i < length; i++) {
                cols.items[i].sync(level + 1, depth);
            }
            me.setMergeDown(null);
        } else {
            down = depth - level;
            me.setMergeDown(down > 0 ? down : null);
        }
        me.setMergeAcross(count > 0 ? count : null);
    },
    onColumnAdd: function(collection, details) {
        var items = details.items,
            length = items.length,
            table = this.getTable(),
            i, item;
        for (i = 0; i < length; i++) {
            item = items[i];
            item.setTable(table);
        }
        if (table) {
            table.syncColumns();
        }
    },
    onColumnRemove: function(collection, details) {
        var table = this.getTable();
        Ext.destroy(details.items);
        if (table) {
            table.syncColumns();
        }
    },
    getColumnCount: function(columns) {
        var s = 0,
            cols;
        if (!columns) {
            columns = this.getColumns();
            if (!columns) {
                return 1;
            }
        }
        for (var i = 0; i < columns.length; i++) {
            cols = columns.getAt(i).getColumns();
            if (!cols) {
                s += 1;
            } else {
                s += this.getColumnCount(cols);
            }
        }
        return s;
    },
    /**
     * Convenience method to add columns.
     * @param {Object/Array} config
     * @return {Ext.exporter.data.Column/Ext.exporter.data.Column[]}
     */
    addColumn: function(config) {
        if (!this.getColumns()) {
            this.setColumns([]);
        }
        return this.getColumns().add(config || {});
    },
    /**
     * Convenience method to fetch a column by its id.
     * @param id
     * @return {Ext.exporter.data.Column}
     */
    getColumn: function(id) {
        return this.getColumns().get(id);
    }
});

/**
 * This class implements a table cell definition
 */
Ext.define('Ext.exporter.data.Cell', {
    extend: 'Ext.exporter.data.Base',
    config: {
        /**
         * @cfg {Number/String/Date} value
         *
         * Cell's value
         *
         */
        value: null
    }
});

/**
 * This class implements a table row definition.
 */
Ext.define('Ext.exporter.data.Row', {
    extend: 'Ext.exporter.data.Base',
    requires: [
        'Ext.exporter.data.Cell'
    ],
    config: {
        /**
         * @cfg {Ext.exporter.data.Cell[]} cells
         *
         * Row's cells
         */
        cells: null
    },
    destroy: function() {
        this.clearCollections();
    },
    applyCells: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.data.Cell');
    },
    /**
     * Convenience method to add cells.
     * @param {Object/Array} config
     * @return {Ext.exporter.data.Cell/Ext.exporter.data.Cell[]}
     */
    addCell: function(config) {
        if (!this._cells) {
            this.setCells([]);
        }
        return this._cells.add(config || {});
    },
    /**
     * Convenience method to fetch a cell by its id.
     * @param id
     * @return {Ext.exporter.data.Cell}
     */
    getCell: function(id) {
        return this._cells ? this._cells.get(id) : null;
    }
});

/**
 * This class implements a table group definition.
 */
Ext.define('Ext.exporter.data.Group', {
    extend: 'Ext.exporter.data.Base',
    requires: [
        'Ext.exporter.data.Row'
    ],
    config: {
        /**
         * @cfg {String} text
         *
         * Group's header
         *
         */
        text: null,
        /**
         * @cfg {Ext.exporter.data.Row[]} rows
         *
         * Group's rows
         *
         */
        rows: null,
        /**
         * @cfg {Ext.exporter.data.Row[]} summaries
         *
         * Group's summaries
         *
         */
        summaries: null,
        /**
         * @cfg {Ext.exporter.data.Row} summary
         *
         * Define a single summary row. Kept for compatibility.
         * @private
         * @hide
         */
        summary: null,
        /**
         * @cfg {Ext.exporter.data.Group[]} groups
         *
         * Collection of sub-groups belonging to this group.
         *
         */
        groups: null
    },
    destroy: function() {
        var me = this;
        me.clearCollections([
            me._rows,
            me._summaries
        ]);
        me.destroyCollections();
    },
    applyRows: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.data.Row');
    },
    /**
     * Convenience method to add rows.
     * @param {Object/Array} config
     * @return {Ext.exporter.data.Row/Ext.exporter.data.Row[]}
     */
    addRow: function(config) {
        if (!this._rows) {
            this.setRows([]);
        }
        return this._rows.add(config || {});
    },
    /**
     * Convenience method to fetch a row by its id.
     * @param id
     * @return {Ext.exporter.data.Row}
     */
    getRow: function(id) {
        return this._rows ? this._rows.get(id) : null;
    },
    applyGroups: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.data.Group');
    },
    /**
     * Convenience method to add groups.
     * @param {Object/Array} config
     * @return {Ext.exporter.data.Group/Ext.exporter.data.Group[]}
     */
    addGroup: function(config) {
        if (!this._groups) {
            this.setGroups([]);
        }
        return this._groups.add(config || {});
    },
    /**
     * Convenience method to fetch a group by its id.
     * @param id
     * @return {Ext.exporter.data.Group}
     */
    getGroup: function(id) {
        return this._groups ? this._groups.get(id) : null;
    },
    applySummaries: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.data.Row');
    },
    applySummary: function(value) {
        if (value) {
            this.addSummary(value);
        }
        return null;
    },
    /**
     * Convenience method to add summary rows.
     * @param {Object/Array} config
     * @return {Ext.exporter.data.Row/Ext.exporter.data.Row[]}
     */
    addSummary: function(config) {
        if (!this._summaries) {
            this.setSummaries([]);
        }
        return this._summaries.add(config || {});
    },
    /**
     * Convenience method to fetch a summary row by its id.
     * @method getSummary
     * @param id Id of the summary row
     * @return {Ext.exporter.data.Row}
     */
    getSummary: function(id) {
        return this._summaries ? this._summaries.get(id) : null;
    }
});

/**
 * This class implements the data structure required by an exporter.
 */
Ext.define('Ext.exporter.data.Table', {
    extend: 'Ext.exporter.data.Base',
    requires: [
        'Ext.exporter.data.Column',
        'Ext.exporter.data.Group'
    ],
    isDataTable: true,
    config: {
        /**
         * @cfg {Ext.exporter.data.Column[]} columns
         *
         * Collection of columns that need to be exported.
         *
         */
        columns: null,
        /**
         * @cfg {Ext.exporter.data.Group[]} groups
         *
         * Collection of groups that need to be exported.
         *
         */
        groups: null
    },
    autoGenerateId: false,
    applyColumns: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.data.Column');
    },
    updateColumns: function(collection, oldCollection) {
        var me = this;
        if (oldCollection) {
            oldCollection.un({
                add: me.onColumnAdd,
                remove: me.onColumnRemove,
                scope: me
            });
            Ext.destroy(oldCollection.items, oldCollection);
        }
        if (collection) {
            collection.on({
                add: me.onColumnAdd,
                remove: me.onColumnRemove,
                scope: me
            });
            me.onColumnAdd(collection, {
                items: collection.getRange()
            });
            me.syncColumns();
        }
    },
    syncColumns: function() {
        var cols = this.getColumns(),
            depth = this.getColDepth(cols, -1),
            result = {},
            i, j, length, len, keys, arr, prevCol, index;
        if (!cols) {
            return;
        }
        length = cols.length;
        for (i = 0; i < length; i++) {
            cols.items[i].sync(0, depth);
        }
        this.getColumnLevels(cols, depth, result);
        keys = Ext.Object.getKeys(result);
        length = keys.length;
        for (i = 0; i < length; i++) {
            arr = result[keys[i]];
            len = arr.length;
            for (j = 0; j < len; j++) {
                if (j === 0) {
                    index = 1;
                } else if (arr[j - 1]) {
                    prevCol = arr[j - 1].getConfig();
                    index += (prevCol.mergeAcross ? prevCol.mergeAcross + 1 : 1);
                } else {
                    index++;
                }
                if (arr[j]) {
                    arr[j].setIndex(index);
                }
            }
        }
    },
    getLeveledColumns: function() {
        var cols = this.getColumns(),
            depth = this.getColDepth(cols, -1),
            result = {};
        this.getColumnLevels(cols, depth, result, true);
        return result;
    },
    /**
     * Fetch all bottom columns from the `columns` hierarchy.
     *
     * @return {Ext.exporter.data.Column[]}
     */
    getBottomColumns: function() {
        var result = this.getLeveledColumns(),
            keys, len;
        keys = Ext.Object.getKeys(result);
        len = keys.length;
        return len ? result[keys[keys.length - 1]] : [];
    },
    getColumnLevels: function(columns, depth, result, topDown) {
        var col, i, j, len, name, level, cols;
        if (!columns) {
            return;
        }
        len = columns.length;
        for (i = 0; i < len; i++) {
            col = columns.items[i];
            level = col.getLevel();
            cols = col.getColumns();
            name = 's' + level;
            result[name] = result[name] || [];
            result[name].push(col);
            if (!cols) {
                for (j = level + 1; j <= depth; j++) {
                    name = 's' + j;
                    result[name] = result[name] || [];
                    result[name].push(topDown ? col : null);
                }
            } else {
                this.getColumnLevels(cols, depth, result, topDown);
            }
        }
    },
    onColumnAdd: function(collection, details) {
        var items = details.items,
            length = items.length,
            i, item;
        for (i = 0; i < length; i++) {
            item = items[i];
            item.setTable(this);
        }
        this.syncColumns();
    },
    onColumnRemove: function(collection, details) {
        Ext.destroy(details.items);
        this.syncColumns();
    },
    getColumnCount: function() {
        var cols = this._columns,
            s = 0,
            i, length;
        if (cols) {
            length = cols.length;
            for (i = 0; i < length; i++) {
                s += cols.items[i].getColumnCount();
            }
        }
        return s;
    },
    getColDepth: function(columns, level) {
        var m = 0,
            len;
        if (!columns) {
            return level;
        }
        len = columns.length;
        for (var i = 0; i < len; i++) {
            m = Math.max(m, this.getColDepth(columns.items[i]._columns, level + 1));
        }
        return m;
    },
    /**
     * Convenience method to add columns.
     * @param {Object/Array} config
     * @return {Ext.exporter.data.Column/Ext.exporter.data.Column[]}
     */
    addColumn: function(config) {
        if (!this._columns) {
            this.setColumns([]);
        }
        return this._columns.add(config || {});
    },
    /**
     * Convenience method to fetch a column by its id.
     * @param id
     * @return {Ext.exporter.data.Column}
     */
    getColumn: function(id) {
        return this._columns ? this._columns.get(id) : null;
    },
    applyGroups: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.data.Group');
    },
    /**
     * Convenience method to add groups.
     * @param {Object/Array} config
     * @return {Ext.exporter.data.Group/Ext.exporter.data.Group[]}
     */
    addGroup: function(config) {
        if (!this._groups) {
            this.setGroups([]);
        }
        return this._groups.add(config || {});
    },
    /**
     * Convenience method to fetch a group by its id.
     * @param id
     * @return {Ext.exporter.data.Group}
     */
    getGroup: function(id) {
        return this._groups ? this._groups.get(id) : null;
    }
});

/**
 * This is the base class for a file object. This one should be extended
 * by classes that generate content based on templates.
 */
Ext.define('Ext.exporter.file.Base', {
    extend: 'Ext.exporter.data.Base',
    requires: [
        'Ext.XTemplate'
    ],
    /**
     * @private
     * @property {Ext.XTemplate} tpl
     *
     * Template used to render this element
     */
    tpl: null,
    destroy: function() {
        this.tpl = null;
        this.callParent();
    },
    /**
     * Renders the content according to the template provided to the class
     *
     * @returns {String}
     */
    render: function() {
        var me = this,
            data = me.processRenderData(me.getRenderData());
        return me.tpl ? Ext.XTemplate.getTpl(me, 'tpl').apply(data) : '';
    },
    /**
     * Use this function to pre process the render data before applying it to the template
     *
     * @param {Object} data
     * @return {Object}
     * @private
     */
    processRenderData: function(data) {
        return data;
    },
    /**
     * Return the data used when rendering the template
     *
     * @return {Object}
     */
    getRenderData: function() {
        var data = this.getConfig();
        data.self = this;
        return data;
    }
});

/**
 * This class is a generic implementation of a Style. This should be extended to provide Style implementations
 * for different use cases. Check out {@link Ext.exporter.file.excel.Style} and {@link Ext.exporter.file.html.Style}.
 */
Ext.define('Ext.exporter.file.Style', {
    extend: 'Ext.exporter.file.Base',
    config: {
        /**
         * @cfg {String} id
         * A unique name within the document that identifies this style.
         *
         */
        /**
         * @cfg {String} [name]
         *
         * This property identifies this style as a named style.
         *
         */
        name: null,
        /**
         * @cfg {Object} [alignment]
         *
         * Following keys are allowed on this object and are all optional:
         *
         * @cfg {String} alignment.horizontal
         * Specifies the left-to-right alignment of text within a cell. Possible values: `Left`, `Center`, `Right`,
         * `Justify` and `Automatic`.
         *
         * @cfg {Number} alignment.indent
         * Specifies the number of indents.
         *
         * @cfg {String} alignment.readingOrder
         * Specifies the default right-to-left text entry mode for a cell. Possible values: `LeftToRight`,
         * `RightToLeft` and `Context`.
         *
         * @cfg {Number} alignment.rotate
         * Specifies the rotation of the text within the cell.
         *
         * @cfg {String} alignment.vertical
         * Specifies the top-to-bottom alignment of text within a cell. Possible values: `Top`, `Bottom`,
         * `Center` and `Automatic`.
         *
         */
        alignment: null,
        /**
         * @cfg {Object} [font]
         * Defines the font attributes to use in this style.
         *
         *
         * Following keys are allowed on this object:
         *
         * @cfg {Boolean} font.bold
         * Specifies the bold state of the font.
         *
         * @cfg {String} font.color
         * Specifies the color of the font. This value should be a 6-hexadecimal digit number in "#rrggbb" format.
         *
         * @cfg {String} font.fontName
         * Specifies the name of the font.
         *
         * @cfg {Boolean} font.italic
         * Similar to `font.bold` in behavior, this attribute specifies the italic state of the font.
         *
         * @cfg {Number} font.size
         * Specifies the size of the font.
         *
         * @cfg {Boolean} font.strikeThrough
         * Similar to `font.bold` in behavior, this attribute specifies the strike-through state
         * of the font.
         *
         * @cfg {String} font.underline
         * Specifies the underline state of the font. Possible values: `None` and `Single`.
         *
         * @cfg {String} font.family
         * Font family name.
         *
         */
        font: null,
        /**
         * @cfg {Object} [interior]
         * Defines the fill properties to use in this style. Each attribute that is specified is
         * considered an override from the default.
         *
         * Following keys are allowed on this object:
         *
         * @cfg {String} interior.color
         * Specifies the fill color of the cell. This value should be a 6-hexadecimal digit number in "#rrggbb" format.
         *
         * @cfg {String} interior.pattern
         * Specifies the fill pattern in the cell. Possible values: `None`, `Solid`.
         *
         */
        interior: null,
        /**
         * @cfg {String} [format]
         *
         * This can be one of the following values:
         * `General`, `General Number`, `General Date`, `Long Date`, `Medium Date`, `Short Date`, `Long Time`, `Medium Time`,
         * `Short Time`, `Currency`, `Euro Currency`, `Fixed`, `Standard`, `Percent`, `Scientific`, `Yes/No`,
         * `True/False`, or `On/Off`.
         *
         * `Currency` is the currency format with two decimal places.
         *
         * `Euro Currency` is the same as `Currency` using the Euro currency symbol instead.
         *
         */
        format: null,
        /**
         * @cfg {Object[]} [borders]
         *
         * Array of border objects. Following keys are allowed for border objects:
         *
         * @cfg {String} borders.position
         * Specifies which of the possible borders this element represents. Duplicate
         * borders are not permitted and are considered invalid. Possible values: `Left`, `Top`, `Right`, `Bottom`.
         *
         * @cfg {String} borders.color
         * Specifies the color of this border. This value should be a 6-hexadecimal digit number in "#rrggbb" format.
         *
         * @cfg {String} borders.lineStyle
         * Specifies the appearance of this border. Possible values: `None`, `Continuous`, `Dash` and `Dot`.
         *
         * @cfg {Number} borders.weight
         * Specifies the weight (or thickness) of this border.
         *
         */
        borders: null,
        // used to validate the provided values for Style configs
        checks: {
            alignment: {
                horizontal: [
                    'Automatic',
                    'Left',
                    'Center',
                    'Right',
                    'Justify'
                ],
                readingOrder: [
                    'LeftToRight',
                    'RightToLeft',
                    'Context'
                ],
                vertical: [
                    'Automatic',
                    'Top',
                    'Bottom',
                    'Center'
                ]
            },
            font: {
                bold: [
                    true,
                    false
                ],
                italic: [
                    true,
                    false
                ],
                strikeThrough: [
                    true,
                    false
                ],
                underline: [
                    'None',
                    'Single'
                ]
            },
            border: {
                position: [
                    'Left',
                    'Top',
                    'Right',
                    'Bottom'
                ],
                lineStyle: [
                    'None',
                    'Continuous',
                    'Dash',
                    'Dot'
                ]
            },
            interior: {
                pattern: [
                    'None',
                    'Solid'
                ]
            }
        }
    },
    datePatterns: {
        'General Date': 'Y-m-d H:i:s',
        'Long Date': 'l, F d, Y',
        'Medium Date': 'Y-m-d',
        'Short Date': 'n/j/Y',
        'Long Time': 'g:i:s A',
        'Medium Time': 'H:i:s',
        'Short Time': 'g:i A'
    },
    numberPatterns: {
        'General Number': '0',
        'Fixed': '0.00',
        'Standard': '0.00'
    },
    booleanPatterns: {
        'Yes/No': [
            'Yes',
            'No'
        ],
        'True/False': [
            'True',
            'False'
        ],
        'On/Off': [
            'On',
            'Off'
        ]
    },
    constructor: function(config) {
        this.callParent([
            this.uncapitalizeKeys(config)
        ]);
    },
    /**
     * Parse object keys and uncapitalize them. This is useful to keep compatibility with prior versions.
     *
     * @param config
     * @return {Object}
     *
     * @private
     */
    uncapitalizeKeys: function(config) {
        var ret = config,
            keys, len, i, key, v;
        if (Ext.isObject(config)) {
            ret = {};
            keys = Ext.Object.getAllKeys(config);
            len = keys.length;
            for (i = 0; i < len; i++) {
                key = keys[i];
                ret[Ext.String.uncapitalize(key)] = this.uncapitalizeKeys(config[key]);
            }
        } else if (Ext.isArray(config)) {
            ret = [];
            len = config.length;
            for (i = 0; i < len; i++) {
                ret.push(this.uncapitalizeKeys(config[i]));
            }
        }
        return ret;
    },
    destroy: function() {
        var me = this;
        me.setAlignment(null);
        me.setFont(null);
        me.setInterior(null);
        me.setBorders(null);
        me.setChecks(null);
        me.callParent();
    },
    updateAlignment: function(data) {
        this.checkAttribute(data, 'alignment');
    },
    updateFont: function(data) {
        this.checkAttribute(data, 'font');
    },
    updateInterior: function(data) {
        this.checkAttribute(data, 'interior');
    },
    applyBorders: function(borders, oldBolders) {
        if (!borders) {
            return borders;
        }
        borders = Ext.Array.from(borders);
        if (Ext.Array.unique(Ext.Array.pluck(borders, 'position')).length != borders.length) {
            Ext.raise('Invalid border positions supplied');
        }
        return borders;
    },
    updateBorders: function(data) {
        this.checkAttribute(data, 'border');
    },
    checkAttribute: function(data, checkName) {
        var checks = this.getChecks(),
            values, keys, len, i, j, arr, key, obj, lenV, valid;
        if (!data || !checks || !checks[checkName]) {
            return;
        }
        values = Ext.Array.from(data);
        lenV = values.length;
        for (i = 0; i < lenV; i++) {
            obj = values[i];
            keys = Ext.Object.getKeys(obj || {});
            len = keys.length;
            for (j = 0; j < len; j++) {
                key = keys[j];
                if (arr = checks[checkName][key] && obj[key]) {
                    valid = (Ext.isArray(arr) ? Ext.Array.indexOf(arr, obj[key]) : arr === obj[key]);
                    if (!valid) {
                        delete (obj[key]);
                        Ext.raise(Ext.String.format('Invalid key (%0) or value (%1) provided for Style!', key, obj[key]));
                    }
                }
            }
        }
    },
    /**
     * Returns the specified value formatted according to the format of this style.
     * @param v
     */
    getFormattedValue: function(v) {
        var me = this,
            f = me.getFormat(),
            ret = v,
            fmt = Ext.util.Format;
        if (!f || f === 'General' || Ext.isEmpty(v)) {
            return ret;
        }
        if (f === 'Currency') {
            return fmt.currency(v);
        } else if (f === 'Euro Currency') {
            return fmt.currency(v, '€');
        } else if (f === 'Percent') {
            return fmt.number(v * 100, '0.00') + '%';
        } else if (f === 'Scientific') {
            return Number(v).toExponential();
        } else if (me.datePatterns[f]) {
            return fmt.date(v, me.datePatterns[f]);
        } else if (me.numberPatterns[f]) {
            return fmt.number(v, me.numberPatterns[f]);
        } else if (me.booleanPatterns[f]) {
            return v ? me.booleanPatterns[f][0] : me.booleanPatterns[f][1];
        } else if (Ext.isFunction(f)) {
            return f(v);
        }
        return fmt.number(v, f);
    }
});

/**
 * This singleton has methods for file manipulation.
 *
 * It allows file saving using browser features or remote server calls.
 *
 * Call {@link #saveAs} to save text files or {@link #saveBinaryAs} to save binary files.
 * If the browser doesn't support file saving then those functions will upload
 * the file content to the server address provided in {@link #url}.
 *
 * The script from the default {@link #url} has a 5Mb upload limitation for file content.
 * In the "server" folder of the `exporter` package there are examples of
 * scripts that could be used to implement an in-house server.
 *
 * **Note:** When using server side download browser pop-ups should NOT be blocked.
 */
Ext.define('Ext.exporter.File', {
    singleton: true,
    requires: [
        'Ext.promise.Promise',
        'Ext.Deferred'
    ],
    textPopupWait: 'You may close this window after the file is downloaded!',
    textPopupBlocker: 'The file was not saved because pop-up blocker might be enabled! Please check your browser settings.',
    /**
     * @property {String} url
     *
     * Address of the server that supports file downloading. Check out the scripts
     * from the "server" folder of the `exporter` package if an in-house server
     * needs to be implemented.
     */
    url: 'https://exporter.sencha.com',
    /**
     * @property {Boolean} forceDownload
     *
     * Set to `true` to always download files from the server {@link #url} instead of saving
     * files using browser features.
     */
    forceDownload: false,
    /**
     * Check if we need to use a pop-up window to download the file.
     *
     * @return {Boolean} Returns true if a pop-up window is needed to download files
     * @private
     */
    requiresPopup: function() {
        var pt = Ext.platformTags;
        //Safari and Blob are not friends yet
        return this.forceDownload || Ext.isSafari || pt.phone || pt.tablet;
    },
    /**
     * This function tries to open a new pop-up window that will be used to
     * download the file using a remote server call.
     *
     * This function needs to be called after the end-user clicked a button and it should
     * happen in the same cycle as the user interaction otherwise the browser will block it.
     *
     * See http://stackoverflow.com/a/2587692 for more details.
     *
     * @param {Boolean} binary Set to true if the file to be downloaded is binary
     */
    initializePopup: function(binary) {
        var me = this,
            required = me.requiresPopup(),
            win;
        if (!required && binary) {
            required = !me.saveBlobAs;
        }
        me.popup = null;
        if (required) {
            win = window.open('', '_blank');
            if (win) {
                me.popup = win;
                win.document.write(Ext.dom.Helper.markup({
                    tag: 'html',
                    children: [
                        {
                            tag: 'head'
                        },
                        {
                            tag: 'body',
                            children: [
                                {
                                    tag: 'p',
                                    html: me.textPopupWait
                                }
                            ]
                        }
                    ]
                }));
            }
        }
    },
    /**
     * Save a binary file locally using either [Blob][1] or server side script.
     *
     * [1]: https://developer.mozilla.org/en/docs/Web/API/Blob
     *
     * Browser compatibility when using [Blob][1]:
     *
     * - Firefox 20+: max blob size 800 MB
     * - Chrome: max blob size 500 MB
     * - Chrome for Android: max blob size 500 MB
     * - Edge: max blob size n/a
     * - IE 10+: max blob size 600 MB
     * - Opera 15+: max blob size 500 MB
     *
     * For all other browsers it falls back to server side script which means that
     * the file content is uploaded to the server script defined in {@link #url} and comes
     * back to the browser as a file download.
     *
     * @param {String} content File content
     * @param {String} filename Name of the file including the extension
     * @param {String} [charset='UTF-8'] File's charset
     * @param {String} [mimeType='application/octet-stream'] Mime type of the file
     * @return {Ext.promise.Promise}
     */
    saveBinaryAs: function(content, filename, charset, mimeType) {
        var me = this,
            saveAs = me.downloadBinaryAs;
        if (!me.requiresPopup() && me.saveBlobAs) {
            saveAs = me.saveBlobAs;
        }
        // The method saveBlobAs exists only if the browser supports Blob
        return saveAs.call(me, content, filename, charset, mimeType);
    },
    /**
     * Save a binary file using a server side script. The file content, file name, charset and
     * mime-type are uploaded to the server side script and a download is forced from the server.
     *
     * This method can be used when the browser doesn't support [Blobs][1].
     *
     * [1]: https://developer.mozilla.org/en/docs/Web/API/Blob
     *
     * **Note** Browsers pop-ups should NOT be blocked for this feature to work as expected.
     *
     * @param {String} content File content
     * @param {String} filename Name of the file including the extension
     * @param {String} [charset='UTF-8'] File's charset
     * @param {String} [mimeType='application/octet-stream'] Mime type of the file
     * @return {Ext.promise.Promise}
     */
    downloadBinaryAs: function(content, filename, charset, mimeType) {
        var deferred = new Ext.Deferred(),
            markup, win;
        if (!this.url) {
            Ext.raise('Cannot download file since no URL was defined!');
            return deferred.promise;
        }
        markup = Ext.dom.Helper.markup({
            tag: 'html',
            children: [
                {
                    tag: 'head'
                },
                {
                    tag: 'body',
                    children: [
                        {
                            tag: 'form',
                            method: 'POST',
                            action: this.url,
                            children: [
                                {
                                    tag: 'input',
                                    type: 'hidden',
                                    name: 'content',
                                    value: Ext.util.Base64.encode(content)
                                },
                                {
                                    tag: 'input',
                                    type: 'hidden',
                                    name: 'filename',
                                    value: filename
                                },
                                {
                                    tag: 'input',
                                    type: 'hidden',
                                    name: 'charset',
                                    value: charset || 'UTF-8'
                                },
                                {
                                    tag: 'input',
                                    type: 'hidden',
                                    name: 'mime',
                                    value: mimeType || 'application/octet-stream'
                                }
                            ]
                        },
                        {
                            tag: 'script',
                            type: 'text/javascript',
                            children: 'document.getElementsByTagName("form")[0].submit();'
                        }
                    ]
                }
            ]
        });
        win = this.popup || window.open('', '_blank');
        if (win) {
            win.document.write(markup);
            deferred.resolve();
        } else {
            deferred.reject(this.textPopupBlocker);
        }
        this.popup = null;
        return deferred.promise;
    }
}, /**
     * Save a text file locally using the content and name provided.
     *
     * Browser	compatibility:
     *
     * - Firefox 20+: max blob size 800 MB
     * - Chrome: max blob size 500 MB
     * - Chrome for Android: max blob size 500 MB
     * - Edge: max blob size n/a
     * - IE 10+: max blob size 600 MB
     * - IE < 10: Files are saved as text/html and max file size n/a
     * - Opera 15+: max blob size 500 MB
     * - Opera < 15: max blob size n/a
     * - Safari 6.1+: max blob size n/a; Blobs may be opened instead of saved sometimes—you may have
     * to direct your Safari users to manually press ⌘+S to save the file after it is opened.
     * Using the application/octet-stream MIME type to force downloads can cause issues in Safari.
     * - Safari < 6: max blob size n/a
     *
     * @method saveAs
     * @param {String} content File content
     * @param {String} filename Name of the file including the extension
     * @param {String} [charset='UTF-8'] File's charset
     * @param {String} [mimeType='application/octet-stream'] Mime type of the file
     * @return {Ext.promise.Promise}
     */
/**
     * Save a binary file locally using [Blobs][1].
     *
     * Browser compatibility:
     *
     * - Firefox 20+: max blob size 800 MB
     * - Chrome: max blob size 500 MB
     * - Chrome for Android: max blob size 500 MB
     * - Edge: max blob size n/a
     * - IE 10+: max blob size 600 MB
     * - Opera 15+: max blob size 500 MB
     *
     * [1]: https://developer.mozilla.org/en/docs/Web/API/Blob
     *
     * @method saveBlobAs
     * @param {String} content File content
     * @param {String} filename Name of the file including the extension
     * @param {String} [charset='UTF-8'] File's charset
     * @param {String} [mimeType='application/octet-stream'] Mime type of the file
     * @return {Ext.promise.Promise}
     * @private
     */
function(File) {
    /* FileSaver.js
     *  A saveAs() & saveTextAs() FileSaver implementation.
     * 1.1.20160328
     *
     *  Modify by Brian Chen
     * By Eli Grey, http://eligrey.com
     * License: MIT
     *   See https://github.com/eligrey/FileSaver.js/blob/master/LICENSE.md
     */
    /*global self */
    /*jslint bitwise: true, indent: 4, laxbreak: true, laxcomma: true, smarttabs: true, plusplus: true */
    /*! @source http://purl.eligrey.com/github/FileSaver.js/blob/master/FileSaver.js */
    var navigator = window.navigator,
        saveAs = window.saveAs || (function(view) {
            "use strict";
            // IE <10 is explicitly unsupported
            if (typeof navigator !== "undefined" && /MSIE [1-9]\./.test(navigator.userAgent)) {
                return;
            }
            var doc = view.document,
                // only get URL when necessary in case Blob.js hasn't overridden it yet
                get_URL = function() {
                    return view.URL || view.webkitURL || view;
                },
                save_link = doc.createElementNS("http://www.w3.org/1999/xhtml", "a"),
                can_use_save_link = "download" in save_link,
                click = function(node) {
                    var event = new MouseEvent("click");
                    node.dispatchEvent(event);
                },
                is_safari = /Version\/[\d\.]+.*Safari/.test(navigator.userAgent),
                webkit_req_fs = view.webkitRequestFileSystem,
                req_fs = view.requestFileSystem || webkit_req_fs || view.mozRequestFileSystem,
                throw_outside = function(ex) {
                    (view.setImmediate || view.setTimeout)(function() {
                        throw ex;
                    }, 0);
                },
                force_saveable_type = "application/octet-stream",
                fs_min_size = 0,
                // the Blob API is fundamentally broken as there is no "downloadfinished" event to subscribe to
                arbitrary_revoke_timeout = 1000 * 40,
                // in ms
                revoke = function(file) {
                    var revoker = function() {
                            if (typeof file === "string") {
                                // file is an object URL
                                get_URL().revokeObjectURL(file);
                            } else {
                                // file is a File
                                file.remove();
                            }
                        };
                    /* // Take note W3C:
                         var
                         uri = typeof file === "string" ? file : file.toURL()
                         , revoker = function(evt) {
                         // idealy DownloadFinishedEvent.data would be the URL requested
                         if (evt.data === uri) {
                         if (typeof file === "string") { // file is an object URL
                         get_URL().revokeObjectURL(file);
                         } else { // file is a File
                         file.remove();
                         }
                         }
                         }
                         ;
                         view.addEventListener("downloadfinished", revoker);
                         */
                    setTimeout(revoker, arbitrary_revoke_timeout);
                },
                dispatch = function(filesaver, event_types, event) {
                    event_types = [].concat(event_types);
                    var i = event_types.length;
                    while (i--) {
                        var listener = filesaver["on" + event_types[i]];
                        if (typeof listener === "function") {
                            try {
                                listener.call(filesaver, event || filesaver);
                            } catch (ex) {
                                throw_outside(ex);
                            }
                        }
                    }
                },
                auto_bom = function(blob) {
                    // prepend BOM for UTF-8 XML and text/* types (including HTML)
                    if (/^\s*(?:text\/\S*|application\/xml|\S*\/\S*\+xml)\s*;.*charset\s*=\s*utf-8/i.test(blob.type)) {
                        return new Blob([
                            "\ufeff",
                            blob
                        ], {
                            type: blob.type
                        });
                    }
                    return blob;
                },
                FileSaver = function(blob, name, no_auto_bom) {
                    if (!no_auto_bom) {
                        blob = auto_bom(blob);
                    }
                    // First try a.download, then web filesystem, then object URLs
                    var filesaver = this,
                        type = blob.type,
                        blob_changed = false,
                        object_url, target_view,
                        dispatch_all = function() {
                            dispatch(filesaver, "writestart progress write writeend".split(" "));
                        },
                        // on any filesys errors revert to saving with object URLs
                        fs_error = function() {
                            if (target_view && is_safari && typeof FileReader !== "undefined") {
                                // Safari doesn't allow downloading of blob urls
                                var reader = new FileReader();
                                reader.onloadend = function() {
                                    var base64Data = reader.result;
                                    target_view.location.href = "data:attachment/file" + base64Data.slice(base64Data.search(/[,;]/));
                                    filesaver.readyState = filesaver.DONE;
                                    dispatch_all();
                                };
                                reader.readAsDataURL(blob);
                                filesaver.readyState = filesaver.INIT;
                                return;
                            }
                            // don't create more object URLs than needed
                            if (blob_changed || !object_url) {
                                object_url = get_URL().createObjectURL(blob);
                            }
                            if (target_view) {
                                target_view.location.href = object_url;
                            } else {
                                var new_tab = view.open(object_url, "_blank");
                                if (new_tab === undefined && is_safari) {
                                    //Apple do not allow window.open, see http://bit.ly/1kZffRI
                                    view.location.href = object_url;
                                }
                            }
                            filesaver.readyState = filesaver.DONE;
                            dispatch_all();
                            revoke(object_url);
                        },
                        abortable = function(func) {
                            return function() {
                                if (filesaver.readyState !== filesaver.DONE) {
                                    return func.apply(this, arguments);
                                }
                            };
                        },
                        create_if_not_found = {
                            create: true,
                            exclusive: false
                        },
                        slice;
                    
                    filesaver.readyState = filesaver.INIT;
                    if (!name) {
                        name = "download";
                    }
                    if (can_use_save_link) {
                        object_url = get_URL().createObjectURL(blob);
                        setTimeout(function() {
                            save_link.href = object_url;
                            save_link.download = name;
                            click(save_link);
                            dispatch_all();
                            revoke(object_url);
                            filesaver.readyState = filesaver.DONE;
                        });
                        return;
                    }
                    // Object and web filesystem URLs have a problem saving in Google Chrome when
                    // viewed in a tab, so I force save with application/octet-stream
                    // http://code.google.com/p/chromium/issues/detail?id=91158
                    // Update: Google errantly closed 91158, I submitted it again:
                    // https://code.google.com/p/chromium/issues/detail?id=389642
                    if (view.chrome && type && type !== force_saveable_type) {
                        slice = blob.slice || blob.webkitSlice;
                        blob = slice.call(blob, 0, blob.size, force_saveable_type);
                        blob_changed = true;
                    }
                    // Since I can't be sure that the guessed media type will trigger a download
                    // in WebKit, I append .download to the filename.
                    // https://bugs.webkit.org/show_bug.cgi?id=65440
                    if (webkit_req_fs && name !== "download") {
                        name += ".download";
                    }
                    if (type === force_saveable_type || webkit_req_fs) {
                        target_view = view;
                    }
                    if (!req_fs) {
                        fs_error();
                        return;
                    }
                    fs_min_size += blob.size;
                    req_fs(view.TEMPORARY, fs_min_size, abortable(function(fs) {
                        fs.root.getDirectory("saved", create_if_not_found, abortable(function(dir) {
                            var save = function() {
                                    dir.getFile(name, create_if_not_found, abortable(function(file) {
                                        file.createWriter(abortable(function(writer) {
                                            writer.onwriteend = function(event) {
                                                target_view.location.href = file.toURL();
                                                filesaver.readyState = filesaver.DONE;
                                                dispatch(filesaver, "writeend", event);
                                                revoke(file);
                                            };
                                            writer.onerror = function() {
                                                var error = writer.error;
                                                if (error.code !== error.ABORT_ERR) {
                                                    fs_error();
                                                }
                                            };
                                            "writestart progress write abort".split(" ").forEach(function(event) {
                                                writer["on" + event] = filesaver["on" + event];
                                            });
                                            writer.write(blob);
                                            filesaver.abort = function() {
                                                writer.abort();
                                                filesaver.readyState = filesaver.DONE;
                                            };
                                            filesaver.readyState = filesaver.WRITING;
                                        }), fs_error);
                                    }), fs_error);
                                };
                            dir.getFile(name, {
                                create: false
                            }, abortable(function(file) {
                                // delete file if it already exists
                                file.remove();
                                save();
                            }), abortable(function(ex) {
                                if (ex.code === ex.NOT_FOUND_ERR) {
                                    save();
                                } else {
                                    fs_error();
                                }
                            }));
                        }), fs_error);
                    }), fs_error);
                },
                FS_proto = FileSaver.prototype,
                saveAs = function(blob, name, no_auto_bom) {
                    return new FileSaver(blob, name, no_auto_bom);
                };
            
            // IE 10+ (native saveAs)
            if (typeof navigator !== "undefined" && navigator.msSaveOrOpenBlob) {
                return function(blob, name, no_auto_bom) {
                    if (!no_auto_bom) {
                        blob = auto_bom(blob);
                    }
                    return navigator.msSaveOrOpenBlob(blob, name || "download");
                };
            }
            FS_proto.abort = function() {
                var filesaver = this;
                filesaver.readyState = filesaver.DONE;
                dispatch(filesaver, "abort");
            };
            FS_proto.readyState = FS_proto.INIT = 0;
            FS_proto.WRITING = 1;
            FS_proto.DONE = 2;
            FS_proto.error = FS_proto.onwritestart = FS_proto.onprogress = FS_proto.onwrite = FS_proto.onabort = FS_proto.onerror = FS_proto.onwriteend = null;
            return saveAs;
        }(typeof self !== "undefined" && self || typeof window !== "undefined" && window || this.content));
    // `self` is undefined in Firefox for Android content script context
    // while `this` is nsIContentFrameMessageManager
    // with an attribute `content` that corresponds to the window
    if (typeof module !== "undefined" && module.exports) {
        module.exports.saveAs = saveAs;
    } else if ((typeof define !== "undefined" && define !== null) && (define.amd !== null)) {
        define([], function() {
            return saveAs;
        });
    }
    var saveTextAs = window.saveTextAs || (function(textContent, fileName, charset) {
            fileName = fileName || 'download.txt';
            charset = charset || 'utf-8';
            textContent = (textContent || '').replace(/\r?\n/g, "\r\n");
            if (saveAs && Blob) {
                var blob = new Blob([
                        textContent
                    ], {
                        type: "text/plain;charset=" + charset
                    });
                saveAs(blob, fileName);
                return true;
            } else {
                //IE9-
                var saveTxtWindow = window.frames.saveTxtWindow;
                if (!saveTxtWindow) {
                    saveTxtWindow = document.createElement('iframe');
                    saveTxtWindow.id = 'saveTxtWindow';
                    saveTxtWindow.style.display = 'none';
                    document.body.insertBefore(saveTxtWindow, null);
                    saveTxtWindow = window.frames.saveTxtWindow;
                    if (!saveTxtWindow) {
                        saveTxtWindow = File.popup || window.open('', '_temp', 'width=100,height=100');
                        if (!saveTxtWindow) {
                            //window.alert('Sorry, download file could not be created.');
                            return false;
                        }
                    }
                }
                var doc = saveTxtWindow.document;
                doc.open('text/html', 'replace');
                doc.charset = charset;
                // if the textContent is a full html page then we need to update the entire document not only the body
                doc.write(textContent);
                doc.close();
                var retValue = doc.execCommand('SaveAs', null, fileName);
                saveTxtWindow.close();
                return retValue;
            }
        });
    File.saveAs = function(content, filename, charset, mimeType) {
        var deferred;
        if (this.requiresPopup()) {
            return this.downloadBinaryAs(content, filename, charset || 'UTF-8', mimeType || 'text/plain');
        } else {
            deferred = new Ext.Deferred();
            if (saveTextAs(content, filename, charset)) {
                deferred.resolve();
            } else {
                deferred.reject();
            }
            return deferred.promise;
        }
    };
    if (saveAs && Blob) {
        File.saveBlobAs = function(textContent, fileName, charset, mimeType) {
            var deferred = new Ext.Deferred();
            var uint8 = new Uint8Array(textContent.length),
                len = uint8.length,
                bType = {
                    type: mimeType || 'application/octet-stream'
                },
                blob, i;
            for (i = 0; i < len; i++) {
                uint8[i] = textContent.charCodeAt(i);
            }
            blob = new Blob([
                uint8
            ], bType);
            saveAs(blob, fileName);
            deferred.resolve();
            return deferred.promise;
        };
    }
});

/**
 * This is the base class for an exporter. This class is supposed to be extended to allow
 * data export to various formats.
 *
 * The purpose is to have more exporters that can take the same {@link #data data set} and export it to different
 * formats.
 *
 * Exporters are used by {@link Ext.grid.plugin.Exporter} and {@link Ext.pivot.plugin.Exporter}
 * but could also be used individually when needed.
 *
 * If there is a requirement that the above plugins should export the data to a document format
 * that is currently not supported by the `exporter` package then it's better to extend this class
 * to create a custom exporter that does that. This way both plugins can use the same custom exporter.
 *
 * There are cases when tabular data that doesn't come from a grid panel or a pivot grid needs to
 * be exported to a file. This could be achieved using the available exporters independently.
 *
 *      var exporter = Ext.Factory.exporter({
 *          type: 'excel',
 *          data: {
 *              columns: [{
 *                  text: 'Vacation',
 *                  columns: [
 *                      { text: 'Month', width: 200, style: { alignment: { horizontal: 'Right' } } },
 *                      { text: 'Days', style: { format: 'General Number' } }
 *                  ]
 *              }],
 *              groups: [{
 *                  text: 'Employees',
 *                  groups: [{
 *                      text: 'Adrian',
 *                      rows: [{
 *                          cells: [
 *                              { value: 'January' },
 *                              { value: 2 }
 *                          ]
 *                      },{
 *                          cells: [
 *                              { value: 'July' },
 *                              { value: 10 }
 *                          ]
 *                      }],
 *                      summaries: [{
 *                          cells: [
 *                              { value: 'Total' },
 *                              { value: 12 }
 *                          ]
 *                      }]
 *                  },{
 *                      text: 'John',
 *                      rows: [{
 *                          cells: [
 *                              { value: 'March' },
 *                              { value: 4 }
 *                          ]
 *                      },{
 *                          cells: [
 *                              { value: 'May' },
 *                              { value: 4 }
 *                          ]
 *                      },{
 *                          cells: [
 *                              { value: 'July' },
 *                              { value: 2 }
 *                          ]
 *                      }],
 *                      summaries: [{
 *                          cells: [
 *                              { value: 'Total' },
 *                              { value: 10 }
 *                          ]
 *                      }]
 *                  }],
 *                  summaries: [{
 *                      cells: [
 *                          { value: 'Grand total' },
 *                          { value: 22 }
 *                      ]
 *                  }]
 *              }]
 *          }
 *      });
 *
 *      // save the file
 *      exporter.saveAs().then( function() { exporter.destroy(); } );
 *
 */
Ext.define('Ext.exporter.Base', {
    mixins: [
        'Ext.mixin.Factoryable'
    ],
    alias: 'exporter.base',
    requires: [
        'Ext.exporter.data.Table',
        'Ext.exporter.file.Style',
        'Ext.exporter.File'
    ],
    config: {
        /**
         * @cfg {Ext.exporter.data.Table} data (required)
         *
         * Data to be consumed by the exporter.
         *
         */
        data: null,
        /**
         * @cfg {Boolean} [showSummary=true]
         *
         * Should group summaries be shown? The data this exporter can consume
         * may contain group summaries.
         */
        showSummary: true,
        /**
         * @cfg {String} [title=""]
         *
         * Title displayed above the table. Hidden when empty
         */
        title: null,
        /**
         * @cfg {String} [author="Sencha"]
         *
         * The author that generated the file.
         */
        author: 'Sencha',
        /**
         * @cfg {String} [fileName="export.txt"]
         *
         * Name of the saved file
         */
        fileName: 'export.txt',
        /**
         * @cfg {String} [charset="UTF-8"]
         *
         * File's charset
         */
        charset: 'UTF-8',
        /**
         * @cfg {String} [mimeType="text/plain"]
         *
         * File's mime type
         */
        mimeType: 'text/plain',
        /**
         * @cfg {String} [binary=false]
         *
         * Set to `true` if the exporter generates a binary file.
         */
        binary: false
    },
    constructor: function(config) {
        this.initConfig(config || {});
        Ext.exporter.File.initializePopup(this.getBinary());
        return this.callParent([
            config
        ]);
    },
    destroy: function() {
        this.setData(Ext.destroy(this.getData()));
        this.callParent();
    },
    /**
     * @method
     * Generates the file content.
     */
    getContent: Ext.identityFn,
    /**
     * Save the file on user's machine using the content generated by this exporter.
     *
     * @return {Ext.promise.Promise}
     */
    saveAs: function() {
        var me = this,
            deferred = new Ext.Deferred();
        Ext.asap(me.delayedSave, me, [
            deferred
        ]);
        return deferred.promise;
    },
    delayedSave: function(deferred) {
        var me = this,
            fn = me.getBinary() ? 'saveBinaryAs' : 'saveAs',
            promise = Ext.exporter.File[fn](me.getContent(), me.getFileName(), me.getCharset(), me.getMimeType());
        promise.then(function() {
            deferred.resolve();
        }, function(msg) {
            deferred.reject(msg);
        });
    },
    /**
     * Returns the number of columns available in the provided `columns` array.
     * It will parse the whole tree structure to count the bottom level columns too.
     *
     * @param columns
     * @return {Number}
     */
    getColumnCount: function(columns) {
        var s = 0;
        if (!columns) {
            return s;
        }
        for (var i = 0; i < columns.length; i++) {
            if (!columns[i].columns) {
                s += 1;
            } else {
                s += this.getColumnCount(columns[i].columns);
            }
        }
        return s;
    },
    applyData: function(data) {
        if (!data || data.isDataTable) {
            return data;
        }
        return new Ext.exporter.data.Table(data);
    }
});

/**
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.Base', {
    extend: 'Ext.exporter.file.Base',
    config: {
        /**
         * @private
         */
        tplAttributes: {
            $value: [],
            merge: function(newValue, oldValue) {
                return [].concat(newValue, oldValue);
            }
        },
        /**
         * @private
         */
        tplNonAttributes: {
            $value: [
                'idPrefix',
                'id',
                'autoGenerateId',
                'self',
                'tplAttributes',
                'tplNonAttributes'
            ],
            merge: function(newValue, oldValue) {
                return [].concat(newValue, oldValue);
            }
        }
    },
    /**
     * Set to `true` if you want to generate an `attributes` key on the template render data.
     * The value of this key is a concatenated string of pairs `config_name=config_value`.
     * This means that each config that will participate in the `attributes` has the same name
     * as the expected XML attribute. Changing the config name will have an impact on the XML
     * attribute.
     *
     * In `tplNonAttributes` there is a list of configs that should not be part of attributes.
     *
     * In `tplAttributes` define the configs that should be part of attributes.
     *
     * If `tplAttributes` is empty then the all configs are used except for `tplNonAttributes` defined.
     *
     * @private
     */
    generateTplAttributes: false,
    processRenderData: function(data) {
        var attr = this.getTplAttributes(),
            nonAttr = this.getTplNonAttributes(),
            keys = Ext.Object.getAllKeys(data),
            len = keys.length,
            str = '',
            i, key;
        if (!this.generateTplAttributes) {
            data.attributes = '';
            return data;
        }
        for (i = 0; i < len; i++) {
            key = keys[i];
            if (attr && attr.length) {
                if (Ext.Array.indexOf(attr, key) >= 0 && data[key] !== null) {
                    str += (str.length ? ' ' : '') + this.processTplAttribute(key, data[key]);
                }
            } else if (nonAttr && nonAttr.length) {
                if (Ext.Array.indexOf(nonAttr, key) < 0 && data[key] !== null) {
                    str += (str.length ? ' ' : '') + this.processTplAttribute(key, data[key]);
                }
            }
        }
        data.attributes = str;
        return data;
    },
    processTplAttribute: function(attr, value) {
        var v = value;
        if (typeof value === 'boolean') {
            v = Number(value);
        } else if (typeof value === 'string') {
            v = Ext.util.Format.htmlEncode(Ext.util.Base64._utf8_encode(value));
        }
        return (attr + '="' + v + '"');
    }
});

/**
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.Relationship', {
    extend: 'Ext.exporter.file.Base',
    isRelationship: true,
    config: {
        idPrefix: 'rId',
        schema: '',
        target: '',
        /**
         * @private
         * All relationships targets should be relative paths to this parent folder.
         */
        parentFolder: null,
        /**
         * @private
         * Calculated as the `target` path relative to the parent folder
         */
        path: null
    },
    tpl: [
        '<Relationship Id="{id}" Type="{schema}" Target="{path}"/>'
    ],
    updateTarget: function(target) {
        this.calculatePath();
    },
    applyParentFolder: function(folder) {
        folder = folder || '';
        if (folder[folder.length - 1] == '/') {
            folder = folder.slice(0, folder.length - 1);
        }
        return folder;
    },
    updateParentFolder: function(folder) {
        this.calculatePath();
    },
    calculatePath: function() {
        var from = String(this.getParentFolder() || ''),
            to = String(this.getTarget() || ''),
            fromParts = from.split('/'),
            toParts = to.split('/'),
            length = Math.min(fromParts.length, toParts.length),
            samePartsLength = length,
            path = '',
            outputParts = [],
            i;
        for (i = 0; i < length; i++) {
            if (fromParts[i] !== toParts[i]) {
                samePartsLength = i;
                break;
            }
        }
        if (samePartsLength == 0) {
            path = to;
        } else {
            for (i = samePartsLength; i < fromParts.length; i++) {
                outputParts.push('..');
            }
            outputParts = outputParts.concat(toParts.slice(samePartsLength));
            path = outputParts.join('/');
        }
        this.setPath(path);
    }
});

/**
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.ContentType', {
    extend: 'Ext.exporter.file.Base',
    isContentType: true,
    config: {
        tag: 'Override',
        partName: '',
        contentType: '',
        extension: ''
    },
    tpl: [
        '<{tag}',
        '<tpl if="extension"> Extension="{extension}"</tpl>',
        '<tpl if="partName"> PartName="{partName}"</tpl>',
        '<tpl if="contentType"> ContentType="{contentType}"</tpl>',
        '/>'
    ]
});

/**
 * Extend this class when the new class needs to generate an xml file
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.Xml', {
    extend: 'Ext.exporter.file.ooxml.Base',
    requires: [
        'Ext.exporter.file.ooxml.Relationship',
        'Ext.exporter.file.ooxml.ContentType'
    ],
    config: {
        /**
         * @cfg {String} folder
         *
         * Full path to the folder where the file exists inside the zip archive
         */
        folder: null,
        /**
         * @cfg {String} fileName
         *
         * Name of the xml file without extension. Use `fileNameTemplate` to define the extension.
         */
        fileName: null,
        /**
         * @cfg {String}
         * @readonly
         *
         * Full path of the file inside the zip package. It combines the `folder` and the `fileName`.
         */
        path: null,
        /**
         * @cfg {Ext.exporter.file.ooxml.Relationship} relationship
         *
         * If the file needs to be part of a '.rels' file then this entity needs to be defined
         */
        relationship: null,
        /**
         * @cfg {Ext.exporter.file.ooxml.ContentType} contentType
         *
         * If the file needs to be part of the '[Content_Types].xml' file then this entity needs
         * to be defined
         */
        contentType: null
    },
    cachedConfig: {
        /**
         * @cfg {String} fileNameTemplate
         *
         * A template to generate the file name. You can use any config defined on the class.
         */
        fileNameTemplate: '{fileName}.xml'
    },
    tplNonAttributes: [
        'path',
        'relationship',
        'contentType',
        'fileName',
        'folder',
        'fileNameTemplate'
    ],
    destroy: function() {
        this.setRelationship(null);
        this.setContentType(null);
        this.callParent();
    },
    applyFolder: function(folder) {
        folder = folder || '';
        if (folder[folder.length - 1] !== '/') {
            folder += '/';
        }
        return folder;
    },
    updateFolder: function() {
        this.generatePath();
    },
    updateFileName: function() {
        this.generatePath();
    },
    getFileNameFromTemplate: function() {
        var tpl = Ext.XTemplate.getTpl(this, '_fileNameTemplate');
        return (tpl ? tpl.apply(this.getConfig()) : '');
    },
    generatePath: function() {
        this.setPath((this.getFolder() || '') + this.getFileNameFromTemplate());
    },
    updatePath: function(path) {
        var relationship = this.getRelationship(),
            type = this.getContentType();
        if (relationship) {
            relationship.setTarget(path);
        }
        if (type) {
            type.setPartName(path);
        }
    },
    applyRelationship: function(data) {
        if (!data || data.isRelationship) {
            return data;
        }
        return new Ext.exporter.file.ooxml.Relationship(data);
    },
    updateRelationship: function(data, oldData) {
        Ext.destroy(oldData);
    },
    applyContentType: function(data) {
        if (!data || data.isContentType) {
            return data;
        }
        return new Ext.exporter.file.ooxml.ContentType(data);
    },
    updateContentType: function(data, oldData) {
        Ext.destroy(oldData);
    },
    /**
     * Collect all files that are part of the final zip file
     * @param {Object} files Object key is the path to the file and object value is the content
     * @param {Ext.exporter.file.ooxml.ContentType[]} types
     */
    collectFiles: Ext.emptyFn
});

/**
 * This class generates a '.rels' file that contain all links to related objects.
 *
 * i.e. a worksheet may have a pivot table or the workbook has multiple sheets
 *
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.Relationships', {
    extend: 'Ext.exporter.file.ooxml.Xml',
    isRelationships: true,
    currentIndex: 1,
    config: {
        /**
         * @private
         * All relationships targets should be relative paths to this parent folder
         * when the file is generated otherwise iOS Safari won't display the file
         */
        parentFolder: null,
        items: []
    },
    contentType: {
        contentType: 'application/vnd.openxmlformats-package.relationships+xml'
    },
    fileNameTemplate: '{fileName}.rels',
    tpl: [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">',
        '<tpl if="items"><tpl for="items.getRange()">{[values.render()]}</tpl></tpl>',
        '</Relationships>'
    ],
    collectFiles: function(files) {
        var items = this.getItems(),
            length = items.length,
            folder = this.getParentFolder(),
            i;
        if (length) {
            for (i = 0; i < length; i++) {
                items.getAt(i).setParentFolder(folder);
            }
            files[this.getPath()] = this.render();
        }
    },
    applyFolder: function(folder, oldFolder) {
        folder = this.callParent([
            folder,
            oldFolder
        ]);
        return folder + '_rels/';
    },
    applyItems: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.file.ooxml.Relationship');
    },
    updateItems: function(collection, oldCollection) {
        var me = this;
        if (oldCollection) {
            oldCollection.un({
                add: me.updateIds,
                remove: me.updateIds,
                scope: me
            });
        }
        if (collection) {
            collection.on({
                add: me.updateIds,
                remove: me.updateIds,
                scope: me
            });
        }
    },
    updateIds: function(items) {
        var i, len, item;
        if (!items) {
            return;
        }
        len = items.length;
        for (i = 0; i < len; i++) {
            item = items.getAt(i);
            item.setId('rId' + (i + 1));
        }
    },
    /**
     * Convenience method to add relationships.
     * @param {Object/Array} config
     * @return {Ext.exporter.file.ooxml.Relationship/Ext.exporter.file.ooxml.Relationship[]}
     */
    addRelationship: function(config) {
        return this.getItems().add(config || {});
    },
    removeRelationship: function(config) {
        return this.getItems().remove(config);
    }
});

/**
 * Extend this class when the new class needs to generate an xml file and .rels files
 * for all linked relationships
 *
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.XmlRels', {
    extend: 'Ext.exporter.file.ooxml.Xml',
    requires: [
        'Ext.exporter.file.ooxml.Relationships'
    ],
    config: {
        /**
         * @cfg {Number} index
         *
         * Index of the file in the upper collection.
         */
        index: null,
        /**
         * @cfg {String} name
         *
         * A name that better represents the object (ie. worksheet name, pivot table name etc)
         */
        name: null,
        relationships: {
            contentType: {
                contentType: 'application/vnd.openxmlformats-package.relationships+xml'
            }
        }
    },
    cachedConfig: {
        /**
         * @cfg {String} nameTemplate
         *
         * A template to generate the object name. You can use any config defined on the class.
         */
        nameTemplate: '{name}'
    },
    tplNonAttributes: [
        'index',
        'relationships',
        'nameTemplate'
    ],
    contentType: {},
    relationship: {},
    fileNameTemplate: '{fileName}{index}.xml',
    destroy: function() {
        this.setRelationships(null);
        this.callParent();
    },
    updateFolder: function(folder, oldFolder) {
        var rels = this.getRelationships();
        if (rels) {
            rels.setFolder(folder);
        }
        this.callParent([
            folder,
            oldFolder
        ]);
    },
    applyRelationships: function(data) {
        if (!data || data.isRelationships) {
            return data;
        }
        return new Ext.exporter.file.ooxml.Relationships(data);
    },
    updateRelationships: function(data, oldData) {
        Ext.destroy(oldData);
    },
    updateIndex: function() {
        this.generatePath();
    },
    generateName: function() {
        var tpl = Ext.XTemplate.getTpl(this, '_nameTemplate');
        this.setName(tpl ? tpl.apply(this.getConfig()) : '');
    },
    /**
     * Collect all files that are part of the final zip file
     * @param {Object} files Object key is the path to the file and object value is the content
     */
    collectFiles: function(files) {
        this.collectRelationshipsFiles(files);
        files[this.getPath()] = this.render();
    },
    collectRelationshipsFiles: function(files) {
        var rels = this.getRelationships(),
            name = this.getFileName();
        if (rels) {
            rels.setFileName(name ? this.getFileNameFromTemplate() : '');
            rels.setParentFolder(this.getFolder());
            rels.collectFiles(files);
        }
    },
    /**
     * Collect all content types that are part of the final zip file
     * @param {Ext.exporter.file.ooxml.ContentType[]} types
     */
    collectContentTypes: function(types) {
        types.push(this.getContentType());
    }
});

/**
 * Implementation of a file stored inside a zip archive
 *
 * @private
 */
Ext.define('Ext.exporter.file.zip.File', {
    extend: 'Ext.Base',
    requires: [
        'Ext.overrides.exporter.util.Format'
    ],
    config: {
        path: '',
        data: null,
        dateTime: null,
        folder: false
    },
    constructor: function(config) {
        var me = this;
        me.initConfig(config);
        if (!me.getDateTime()) {
            me.setDateTime(new Date());
        }
        return me.callParent([
            config
        ]);
    },
    getId: function() {
        return this.getPath();
    },
    crc32: function(input, crc) {
        var table = this.self.crcTable,
            x = 0,
            y = 0,
            b = 0,
            isArray;
        // this method uses code from https://github.com/Stuk/jszip
        if (typeof input === "undefined" || !input.length) {
            return 0;
        }
        isArray = (typeof input !== "string");
        if (typeof (crc) == "undefined") {
            crc = 0;
        }
        crc = crc ^ (-1);
        for (var i = 0,
            iTop = input.length; i < iTop; i++) {
            b = isArray ? input[i] : input.charCodeAt(i);
            y = (crc ^ b) & 255;
            x = table[y];
            crc = (crc >>> 8) ^ x;
        }
        return crc ^ (-1);
    },
    getHeader: function(offset) {
        var data = this.getData(),
            path = this.getPath(),
            utfName = Ext.util.Base64._utf8_encode(path),
            useUTF8 = utfName !== path,
            dateTime = this.getDateTime(),
            extraFields = '',
            unicodePathExtraField = '',
            decToHex = Ext.util.Format.decToHex,
            header = '',
            dosTime, dosDate, fileHeader, dirHeader;
        // this method uses code from https://github.com/Stuk/jszip
        dosTime = dateTime.getHours();
        dosTime = dosTime << 6;
        dosTime = dosTime | dateTime.getMinutes();
        dosTime = dosTime << 5;
        dosTime = dosTime | dateTime.getSeconds() / 2;
        dosDate = dateTime.getFullYear() - 1980;
        dosDate = dosDate << 4;
        dosDate = dosDate | (dateTime.getMonth() + 1);
        dosDate = dosDate << 5;
        dosDate = dosDate | dateTime.getDate();
        if (useUTF8) {
            unicodePathExtraField = // Version
            decToHex(1, 1) + // NameCRC32
            decToHex(this.crc32(utfName), 4) + // UnicodeName
            utfName;
            extraFields += // Info-ZIP Unicode Path Extra Field
            "up" + // size
            decToHex(unicodePathExtraField.length, 2) + // content
            unicodePathExtraField;
        }
        // version needed to extract
        header += "\n\x00";
        // general purpose bit flag
        // set bit 11 if utf8
        header += useUTF8 ? "\x00\b" : "\x00\x00";
        // compression method
        header += "\x00\x00";
        // last mod file time
        header += decToHex(dosTime, 2);
        // last mod file date
        header += decToHex(dosDate, 2);
        // crc-32
        header += decToHex(data ? this.crc32(data) : 0, 4);
        // compressed size
        header += decToHex(data ? data.length : 0, 4);
        // uncompressed size
        header += decToHex(data ? data.length : 0, 4);
        // file name length
        header += decToHex(utfName.length, 2);
        // extra field length
        header += decToHex(extraFields.length, 2);
        fileHeader = "PK\x03\x04" + header + utfName + extraFields;
        dirHeader = // central file header
        "PK\x01\x02" + // version made by (00: DOS)
        "\x14\x00" + // file header (common to file and central directory)
        header + // file comment length
        "\x00\x00" + // disk number start
        "\x00\x00" + // internal file attributes TODO
        "\x00\x00" + (// external file attributes
        this.getFolder() === true ? "\x10\x00\x00\x00" : "\x00\x00\x00\x00") + // relative offset of local header
        decToHex(offset, 4) + // file name
        utfName + // extra field
        extraFields;
        return {
            fileHeader: fileHeader,
            dirHeader: dirHeader,
            data: data || ''
        };
    }
}, function(File) {
    var c,
        table = [];
    for (var n = 0; n < 256; n++) {
        c = n;
        for (var k = 0; k < 8; k++) {
            c = ((c & 1) ? (3.988292384E9 ^ (c >>> 1)) : (c >>> 1));
        }
        table[n] = c;
    }
    File.crcTable = table;
});

/**
 * Implementation of a folder stored inside a zip archive
 *
 * @private
 */
Ext.define('Ext.exporter.file.zip.Folder', {
    extend: 'Ext.exporter.file.zip.File',
    folder: true
});

/**
 * This class allows creation of zip files without any compression
 *
 * @private
 */
Ext.define('Ext.exporter.file.zip.Archive', {
    extend: 'Ext.exporter.file.Base',
    requires: [
        'Ext.exporter.file.zip.Folder'
    ],
    config: {
        folders: [],
        files: []
    },
    destroy: function() {
        this.setFolders(null);
        this.setFiles(null);
        this.callParent();
    },
    applyFolders: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.file.zip.Folder');
    },
    applyFiles: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.file.zip.File');
    },
    updateFiles: function(collection, oldCollection) {
        var me = this;
        if (oldCollection) {
            oldCollection.un({
                add: me.onFileAdd,
                remove: me.onFileRemove,
                scope: me
            });
        }
        if (collection) {
            collection.on({
                add: me.onFileAdd,
                remove: me.onFileRemove,
                scope: me
            });
            me.onFileAdd(collection, {
                items: collection.getRange()
            });
        }
    },
    onFileAdd: function(collection, details) {
        var folders = this.getFolders(),
            items = details.items,
            length = items.length,
            i, item, folder;
        for (i = 0; i < length; i++) {
            item = items[i];
            folder = this.getParentFolder(item.getPath());
            if (folder) {
                folders.add({
                    path: folder
                });
            }
        }
    },
    onFileRemove: function(collection, details) {
        Ext.destroy(details.items);
    },
    getParentFolder: function(path) {
        var lastSlash;
        if (path.slice(-1) == '/') {
            path = path.substring(0, path.length - 1);
        }
        lastSlash = path.lastIndexOf('/');
        return (lastSlash > 0) ? path.substring(0, lastSlash + 1) : "";
    },
    addFile: function(config) {
        return this.getFiles().add(config || {});
    },
    removeFile: function(config) {
        return this.getFiles().remove(config);
    },
    getContent: function() {
        var fileData = '',
            dirData = '',
            localDirLength = 0,
            centralDirLength = 0,
            decToHex = Ext.util.Format.decToHex,
            files = [],
            len, dirEnd, i, file, header;
        Ext.Array.insert(files, 0, this._folders.items);
        Ext.Array.insert(files, files.length, this._files.items);
        len = files.length;
        // this method uses code from https://github.com/Stuk/jszip
        for (i = 0; i < len; i++) {
            file = files[i];
            header = file.getHeader(localDirLength);
            localDirLength += header.fileHeader.length + header.data.length;
            centralDirLength += header.dirHeader.length;
            fileData += header.fileHeader + header.data;
            dirData += header.dirHeader;
        }
        dirEnd = // central directory end
        "PK\x05\x06" + // number of this disk
        "\x00\x00" + // number of the disk with the start of the central directory
        "\x00\x00" + // total number of entries in the central directory on this disk
        decToHex(len, 2) + // total number of entries in the central directory
        decToHex(len, 2) + // size of the central directory   4 bytes
        decToHex(centralDirLength, 4) + // offset of start of central directory with respect to the starting disk number
        decToHex(localDirLength, 4) + // .ZIP file comment length
        "\x00\x00";
        fileData += dirData + dirEnd;
        return fileData;
    }
});

/**
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.excel.Sheet', {
    extend: 'Ext.exporter.file.ooxml.XmlRels',
    config: {
        /**
         * @cfg {Ext.exporter.file.ooxml.excel.Workbook} workbook
         *
         * Reference to the parent workbook.
         */
        workbook: null
    },
    folder: 'sheet',
    fileName: 'sheet',
    nameTemplate: 'Sheet{index}',
    fileNameTemplate: '{fileName}{index}.xml',
    destroy: function() {
        this.callParent();
        this.setWorkbook(null);
    },
    updateIndex: function() {
        this.generateName();
        this.callParent(arguments);
    },
    applyName: function(value) {
        // Excel limits the worksheet name to 31 chars
        return Ext.String.ellipsis(String(value), 31);
    }
});

/**
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.excel.Column', {
    extend: 'Ext.exporter.file.ooxml.Base',
    config: {
        min: 1,
        max: 1,
        width: 10,
        autoFitWidth: false,
        hidden: false,
        styleId: null
    },
    tpl: [
        '<col ',
        'min="{min}" ',
        'max="{max}" ',
        'width="{width}"',
        '<tpl if="styleId"> style="{styleId}"</tpl>',
        '<tpl if="hidden"> hidden="1"</tpl>',
        '<tpl if="autoFitWidth"> bestFit="1"</tpl>',
        '<tpl if="width != 10"> customWidth="1"</tpl>',
        '/>'
    ]
});

/**
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.excel.Cell', {
    extend: 'Ext.exporter.file.Base',
    isCell: true,
    config: {
        /**
         * @cfg {Ext.exporter.file.ooxml.excel.Row} row
         *
         * Reference to the parent row
         */
        row: null,
        /**
         * @cfg {String} dataType (required)
         *
         * The cell's data type. Possible values:
         *
         * - `b` (Boolean) Cell containing a boolean.
         * - `d` (Date) Cell contains a date in the ISO 8601 format.
         * - `e` (Error) Cell containing an error.
         * - `inlineStr` (InlineString) Cell containing an (inline) rich string, i.e., one not in the shared
         * string table. If this cell type is used, then the cell value is in the `is` element rather than the `v`
         * element in the cell (`c` element).
         * - `n` (Number) Cell containing a number.
         * - `s` (SharedString) Cell containing a shared string.
         * - `str` (String) Cell containing a formula string.
         */
        dataType: null,
        /**
         * @cfg {Boolean} [showPhonetic]
         *
         * `true` if the cell should show phonetic.
         */
        showPhonetic: null,
        /**
         * @cfg {Number} index
         *
         * Specifies the column index of this cell within the containing row. If this tag is not specified, the first
         * instance of a Cell element within a row has an assumed Index="1".
         *
         */
        index: null,
        /**
         * @cfg {String} styleId
         *
         * The index of this cell's style. Style records are stored in the Styles Part.
         */
        styleId: null,
        /**
         * @cfg {Number} mergeAcross
         *
         * Number of cells to merge to the right side of this cell
         */
        mergeAcross: null,
        /**
         * @cfg {Number} mergeDown
         *
         * Number of cells to merge below this cell
         */
        mergeDown: null,
        /**
         * @cfg {Number/Date/String} value (required)
         *
         * Value assigned to this cell
         */
        value: null
    },
    isMergedCell: false,
    tpl: [
        '<c r="{ref}"',
        '<tpl if="value != null"> t="{dataType}"</tpl>',
        '<tpl if="showPhonetic"> ph="1"</tpl>',
        '<tpl if="styleId"> s="{styleId}"</tpl>',
        '<tpl if="value == null">/><tpl else>><v>{value}</v></c></tpl>'
    ],
    constructor: function(config) {
        var cfg = config;
        if (config == null || Ext.isDate(config) || Ext.isPrimitive(config)) {
            cfg = {
                value: config
            };
        }
        return this.callParent([
            cfg
        ]);
    },
    destroy: function() {
        this.setRow(null);
        this.callParent();
    },
    /**
     * Returns the cell reference using the A4 notation
     * @return {String}
     */
    getRef: function() {
        return this.getNotation(this._index) + this._row._index;
    },
    getRenderData: function() {
        var me = this,
            data = {},
            ws = me._row && me._row._worksheet,
            wb = ws && ws._workbook;
        data.dataType = me._dataType;
        data.value = me._value;
        data.showPhonetic = me._showPhonetic;
        data.styleId = me._styleId;
        if (this.isMergedCell && ws) {
            ws.setMergedCellsNo(ws._mergedCellsNo + 1);
        }
        if (data.dataType === 's' && wb) {
            data.value = wb._sharedStrings.addString(data.value);
        }
        data.ref = this.getRef();
        return data;
    },
    applyValue: function(v) {
        var dt;
        if (v != null) {
            if (typeof v === 'number') {
                dt = 'n';
            } else if (typeof v === 'string') {
                dt = 's';
                v = Ext.util.Format.stripTags(v);
            } else if (v instanceof Date) {
                dt = 'd';
                v = Ext.Date.format(v, 'Y-m-d\\TH:i:s.u');
            } else {
                dt = 'b';
            }
            this.setDataType(dt);
        }
        return v;
    },
    updateMergeAcross: function(v) {
        this.isMergedCell = (v || this._mergeDown);
    },
    updateMergeDown: function(v) {
        this.isMergedCell = (v || this._mergeAcross);
    },
    getMergedCellRef: function() {
        var me = this,
            currIndex = me._index,
            rowIndex = me._row._index,
            mAcross = me._mergeAcross,
            mDown = me._mergeDown,
            s = me.getNotation(currIndex) + rowIndex + ':';
        if (mAcross) {
            currIndex += mAcross;
        }
        if (mDown) {
            rowIndex += mDown;
        }
        s += me.getNotation(currIndex) + rowIndex;
        return s;
    },
    /**
     * Formats a number to the A1 style
     *
     * @param index
     * @return {string}
     */
    getNotation: function(index) {
        var code = 65,
            length = 26,
            getChar = String.fromCharCode,
            r, n;
        if (index <= 0) {
            index = 1;
        }
        n = Math.floor(index / length);
        r = index % length;
        if (n === 0 || index === length) {
            return getChar(code + index - 1);
        } else if (r === 0) {
            return this.getNotation(n - 1) + 'Z';
        } else if (n < length) {
            return getChar(code + n - 1) + getChar(code + r - 1);
        } else {
            return this.getNotation(n) + getChar(code + r - 1);
        }
    }
});

/**
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.excel.Row', {
    extend: 'Ext.exporter.file.Base',
    requires: [
        'Ext.exporter.file.ooxml.excel.Cell'
    ],
    config: {
        /**
         * @cfg {Boolean} [collapsed]
         *
         * `true` if the rows 1 level of outlining deeper than the current row are in the collapsed outline state.
         * It means that the rows which are 1 outline level deeper (numerically higher value) than the current
         * row are currently hidden due to a collapsed outline state.
         *
         * It is possible for collapsed to be false and yet still have the rows in question hidden. This can
         * be achieved by having a lower outline level collapsed, thus hiding all the child rows.
         */
        collapsed: null,
        /**
         * @cfg {Boolean} [hidden=false]
         *
         * `true` if the row is hidden, e.g., due to a collapsed outline or by manually selecting and hiding a row.
         */
        hidden: null,
        /**
         * @cfg {Number} [height]
         *
         * Row height measured in point size. There is no margin padding on row height.
         */
        height: null,
        /**
         * @cfg {Number} [outlineLevel]
         *
         * Outlining level of the row, when outlining is on.
         */
        outlineLevel: null,
        /**
         * @cfg {Boolean} [showPhonetic]
         *
         * `true` if the row should show phonetic.
         */
        showPhonetic: null,
        /**
         * @cfg {String} index
         *
         * Row index. Indicates to which row in the sheet this row definition corresponds.
         */
        index: null,
        /**
         * @cfg {String} [styleId]
         *
         * Index to style record for the row
         */
        styleId: null,
        /**
         * @cfg {Ext.exporter.file.ooxml.excel.Worksheet} worksheet
         *
         * Reference to the parent worksheet
         */
        worksheet: null,
        /**
         * @cfg {Ext.exporter.file.ooxml.excel.Cell[]} cells
         *
         * Collection of cells available on this row.
         */
        cells: [],
        cachedCells: null
    },
    tpl: [
        '<row',
        '<tpl if="index"> r="{index}"</tpl>',
        '<tpl if="collapsed"> collapsed="{collapsed}"</tpl>',
        '<tpl if="hidden"> hidden="1"</tpl>',
        '<tpl if="height"> ht="{height}" customHeight="1"</tpl>',
        '<tpl if="outlineLevel"> outlineLevel="{outlineLevel}"</tpl>',
        '<tpl if="styleId"> s="{styleId}" customFormat="1"</tpl>',
        '<tpl if="cachedCells">',
        '>{cachedCells}</row>',
        '<tpl elseif="cells && cells.length">',
        '><tpl for="cells.items">{[values.render()]}</tpl></row>',
        '<tpl else>',
        '/>',
        '</tpl>'
    ],
    lastCellIndex: 1,
    constructor: function(config) {
        var cfg = config;
        if (Ext.isArray(config)) {
            cfg = {
                cells: config
            };
        }
        return this.callParent([
            cfg
        ]);
    },
    destroy: function() {
        this.setWorksheet(null);
        this.callParent();
    },
    applyCells: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.file.ooxml.excel.Cell');
    },
    updateCells: function(collection, oldCollection) {
        var me = this;
        if (oldCollection) {
            collection.un({
                add: me.onCellAdd,
                remove: me.onCellRemove,
                scope: me
            });
        }
        if (collection) {
            collection.on({
                add: me.onCellAdd,
                remove: me.onCellRemove,
                scope: me
            });
            me.onCellAdd(collection, {
                items: collection.getRange()
            });
        }
    },
    onCellAdd: function(collection, details) {
        var items = details.items,
            length = items.length,
            i, item, index;
        for (i = 0; i < length; i++) {
            item = items[i];
            item.setRow(this);
            index = item._index;
            if (!index) {
                item.setIndex(this.lastCellIndex++);
            } else {
                this.lastCellIndex = Math.max(collection.length, index) + 1;
            }
        }
    },
    onCellRemove: function(collection, details) {
        Ext.destroy(details.items);
        this.updateCellIndexes();
    },
    /**
     * Convenience method to add cells.
     * @param {Object/Array} config
     * @return {Ext.exporter.file.ooxml.excel.Cell/Ext.exporter.file.ooxml.excel.Cell[]}
     */
    addCell: function(config) {
        if (!this._cells) {
            this.setCells([]);
        }
        return this._cells.add(config || {});
    },
    /**
     * Convenience method to fetch a cell by its id.
     * @param id
     * @return {Ext.exporter.file.ooxml.excel.Cell}
     */
    getCell: function(id) {
        return this._cells ? this._cells.get(id) : null;
    },
    beginCellRendering: function() {
        var me = this;
        me.tempCells = [];
        me.startCaching = true;
        me.lastCellIndex = 1;
        if (!me.cachedCell) {
            me.cachedCell = new Ext.exporter.file.ooxml.excel.Cell({
                row: me
            });
            me.cachedCellConfig = me.cachedCell.getConfig();
            me.cachedCellConfig.id = null;
        }
    },
    endCellRendering: function() {
        var me = this;
        me.setCachedCells(me.tempCells.join(''));
        me.tempCells = null;
        me.startCaching = false;
        me.lastCellIndex = 1;
    },
    renderCells: function(cells) {
        var me = this,
            ret = {
                first: null,
                last: null,
                row: '',
                merged: ''
            },
            len = cells.length,
            mergedCells = [],
            i, cell, config, cache, index;
        me.beginCellRendering();
        cache = me.cachedCell;
        for (i = 0; i < len; i++) {
            cell = cells[i] || {};
            if (typeof cell === 'object' && !(cell instanceof Date)) {
                config = cell;
            } else {
                config = {
                    value: cell
                };
            }
            Ext.applyIf(config, me.cachedCellConfig);
            //cache.setConfig(config); setConfig is expensive
            cache.setValue(config.value);
            cache.setShowPhonetic(config.showPhonetic);
            cache.setStyleId(config.styleId);
            cache.setMergeAcross(config.mergeAcross);
            cache.setMergeDown(config.mergeDown);
            cache.setIndex(config.index);
            index = cache.getIndex();
            if (!index) {
                cache.setIndex(me.lastCellIndex++);
            } else {
                me.lastCellIndex = Math.max(me.lastCellIndex, index) + 1;
            }
            if (i === 0) {
                ret.first = ret.last = cache.getRef();
            } else if (i === len - 1) {
                ret.last = cache.getRef();
            }
            me.tempCells.push(cache.render());
            if (cache.isMergedCell) {
                mergedCells.push('<mergeCell ref="' + cache.getMergedCellRef() + '"/>');
            }
        }
        me.endCellRendering();
        ret.row = me.render();
        ret.merged = mergedCells.join('');
        return ret;
    }
});

/**
 * (CT_Location)
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.excel.Location', {
    extend: 'Ext.exporter.file.ooxml.Base',
    config: {
        /**
         * @cfg {String} ref (required)
         *
         * Specifies the first row of the PivotTable.
         */
        ref: null,
        /**
         * @cfg {Number} firstHeaderRow (required)
         *
         * Specifies the first row of the PivotTable header, relative to the top left cell in the ref value.
         */
        firstHeaderRow: null,
        /**
         * @cfg {Number} firstDataRow (required)
         *
         * Specifies the first row of the PivotTable data, relative to the top left cell in the ref value.
         */
        firstDataRow: null,
        /**
         * @cfg {Number} firstDataCol (required)
         *
         * Specifies the first column of the PivotTable data, relative to the top left cell in the ref value.
         */
        firstDataCol: null,
        /**
         * @cfg {Number} [rowPageCount]
         *
         * Specifies the number of rows per page for this PivotTable that the filter area will occupy.
         * By default there is a single column of filter fields per page and the fields occupy as many rows
         * as there are fields.
         */
        rowPageCount: null,
        /**
         * @cfg {Number} [colPageCount]
         *
         * Specifies the number of columns per page for this PivotTable that the filter area will occupy.
         * By default there is a single column of filter fields per page and the fields occupy as many rows
         * as there are fields.
         */
        colPageCount: null
    },
    /**
     * @cfg generateTplAttributes
     * @inheritdoc Ext.exporter.file.ooxml.Base#cfg!generateTplAttributes
     * @localdoc
     *
     * **Note** Do not rename the config names that are part of the `attributes` since they are
     * mapped to the xml attributes needed by the template.
     */
    generateTplAttributes: true,
    tpl: [
        '<location {attributes}/>'
    ]
});

/**
 * Represents a single item in PivotTable field.
 *
 * (CT_Item)
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.excel.FieldItem', {
    extend: 'Ext.exporter.file.ooxml.Base',
    config: {
        /**
         * @cfg {Boolean} c
         *
         * Specifies a boolean value that indicates whether the approximate number of child items for
         * this item is greater than zero.
         *
         * A value of 1 or true indicates the approximate number of child items for this item is greater than zero.
         *
         * A value of 0 or false indicates the approximate number of child items for this item is zero.
         */
        c: null,
        /**
         * @cfg {Boolean} d
         *
         * Specifies a boolean value that indicates whether this item has been expanded in the PivotTable view.
         *
         * A value of 1 or true indicates this item has been expanded.
         *
         * A value of 0 or false indicates this item is collapsed.
         */
        d: null,
        /**
         * @cfg {Boolean} e
         *
         * Specifies a boolean value that indicates whether attribute hierarchies nested next to each
         * other on a PivotTable row or column will offer drilling "across" each other or not.
         *
         * [Example: if the application offers drill across for attribute hierarchies and not for user hierarchies,
         * this attribute would only be written when two attribute hierarchies are placed next to each
         * other on an axis. end example]
         *
         * A value of 1 or true indicates there is a drill across attribute hierarchies positioned next to each
         * other on a pivot axis.
         *
         * A value of 0 or false indicates there is not drill across attribute hierarchies.
         */
        e: null,
        /**
         * @cfg {Boolean} f
         *
         * Specifies a boolean value that indicates whether this item is a calculated member.
         *
         * A value of 1 or true indicates this item is a calculated member.
         *
         * A value of 0 or false indicates this item is not calculated.
         */
        f: null,
        /**
         * @cfg {Boolean} h
         *
         * Specifies a boolean value that indicates whether the item is hidden.
         *
         * A value of 1 or true indicates item is hidden.
         */
        h: null,
        /**
         * @cfg {Boolean} m
         *
         * Specifies a boolean value that indicate whether the item has a missing value.
         *
         * A value of 1 or true indicates the item value is missing. The application should still retain
         * the item settings in case the item reappears during a later refresh.
         */
        m: null,
        /**
         * @cfg {String} n
         *
         * Specifies the user caption of the item.
         */
        n: null,
        /**
         * @cfg {Boolean} s
         *
         * Specifies a boolean value that indicates whether the item has a character value.
         *
         * A value of 1 or true indicates the item has a string/character value.
         *
         * A value of 0 or false indicates item the item has a value of a different type.
         */
        s: null,
        /**
         * @cfg {Boolean} sd
         *
         * Specifies a boolean value that indicates whether the details are hidden for this item.
         *
         * A value of 1 or true indicates item details are hidden.
         *
         * A value of 0 or false indicates item details are shown.
         */
        sd: null,
        /**
         * @cfg {String} t
         *
         * Specifies the type of this item. A value of `default` indicates the subtotal or total item.
         *
         * Possible values:
         *
         *  - `avg` (Average): Indicates the pivot item represents an "average" aggregate function.
         *  - `blank` (Blank Pivot Item): Indicates the pivot item represents a blank line.
         *  - `count` (Count): Indicates the pivot item represents custom the "count" aggregate."
         *  - `countA` (CountA): Indicates the pivot item represents the "count numbers" aggregate function.
         *  - `data` (Data): Indicate the pivot item represents data.
         *  - `default` (Default): Indicates the pivot item represents the default type for this PivotTable.
         *  The default pivot item type is the "total" aggregate function.
         *  - `grand` (Grand Total Item): Indicates the pivot items represents the grand total line.
         *  - `max` (Max): Indicates the pivot item represents the "maximum" aggregate function.
         *  - `min` (Min): Indicates the pivot item represents the "minimum" aggregate function.
         *  - `product` (Product): Indicates the pivot item represents the "product" function.
         *  - `stdDev` (stdDev): Indicates the pivot item represents the "standard deviation" aggregate function.
         *  - `stdDevP` (StdDevP): Indicates the pivot item represents the "standard deviation population" aggregate function.
         *  - `sum` (Sum): Indicates the pivot item represents the "sum" aggregate value.
         *  - `var` (Var): Indicates the pivot item represents the "variance" aggregate value.
         *  - `varP` (VarP): Indicates the pivot item represents the "variance population" aggregate value.
         */
        t: null,
        /**
         * @cfg {Number} [x]
         *
         * Specifies the item index in pivotFields collection in the PivotCache.
         */
        x: null
    },
    /**
     * @cfg generateTplAttributes
     * @inheritdoc Ext.exporter.file.ooxml.Base#cfg!generateTplAttributes
     * @localdoc
     *
     * **Note** Do not rename the config names that are part of the `attributes` since they are
     * mapped to the xml attributes needed by the template.
     */
    generateTplAttributes: true,
    tpl: [
        '<item {attributes}/>'
    ]
});

/**
 * Represents a set of selected fields and selected items within those fields.
 *
 * (CT_PivotAreaReference)
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.excel.PivotAreaReference', {
    extend: 'Ext.exporter.file.ooxml.Base',
    config: {
        /**
         * @cfg {Boolean} [avgSubtotal]
         *
         * Specifies a boolean value that indicates whether the 'average' aggregate function is
         * included in the filter.
         *
         * A value of 1 or true indicates the average aggregation function is included in the filter.
         *
         * A value of 0 or false indicates another aggregation function is included in the filter.
         */
        avgSubtotal: null,
        /**
         * @cfg {Boolean} [byPosition]
         *
         * Specifies a boolean value that indicates whether the item is referred to by position
         * rather than item index.
         *
         * A value of 1 or true indicates the item is referred to by position.
         *
         * A value of 0 or false indicates the item is referred to by index.
         */
        byPosition: null,
        /**
         * @cfg {Number} [count]
         *
         * Specifies the number of item indexes in the collection of indexes (x tags).
         */
        count: null,
        /**
         * @cfg {Boolean} [countASubtotal]
         *
         * Specifies a boolean value that indicates whether the 'countA' subtotal is
         * included in the filter.
         *
         * A value of 1 or true indicates the count aggregation function is included in the filter.
         *
         * A value of 0 or false indicates another aggregation function is included in the filter.
         */
        countASubtotal: null,
        /**
         * @cfg {Boolean} [countSubtotal]
         *
         * Specifies a boolean value that indicates whether the count aggregate function is included
         * in the filter.
         *
         * A value of 1 or true indicates the count aggregation function is included in the filter.
         *
         * A value of 0 or false indicates another aggregation function is included in the filter.
         */
        countSubtotal: null,
        /**
         * @cfg {Boolean} [defaultSubtotal]
         *
         * Specifies a boolean value that indicates whether the default subtotal is included in the filter.
         *
         * A value of 1 or true indicates the default subtotal is included in the filter. The default is to
         * display the total or the grand total.
         *
         * A value of 0 or false indicates another subtotal or aggregation function is included in the filter.
         */
        defaultSubtotal: null,
        /**
         * @cfg {Number} [field]
         *
         * Specifies the index of the field to which this filter refers. A value of -2 indicates
         * the 'data' field.
         */
        field: null,
        /**
         * @cfg {Boolean} [maxSubtotal]
         *
         * Specifies a boolean value that indicates whether the 'maximum' aggregate function is
         * included in the filter.
         *
         * A value of 1 or true indicates the maximum aggregation function is included in the filter.
         *
         * A value of 0 or false indicates another aggregation function is included in the filter.
         */
        maxSubtotal: null,
        /**
         * @cfg {Boolean} [minSubtotal]
         *
         * Specifies a boolean value that indicates whether the 'minimum' aggregate function is
         * included in the filter.
         *
         * A value of 1 or true indicates the minimum aggregation function is included in the filter.
         *
         * A value of 0 or false indicates another aggregation function is included in the filter.
         */
        minSubtotal: null,
        /**
         * @cfg {Boolean} [productSubtotal]
         *
         * Specifies a boolean value that indicates whether the 'product' aggregate function is
         * included in the filter.
         *
         * A value of 1 or true indicates the product aggregation function is included in the filter.
         *
         * A value of 0 or false indicates another aggregation function is included in the filter.
         */
        productSubtotal: null,
        /**
         * @cfg {Boolean} [relative]
         *
         * Specifies a boolean value that indicates whether the item is referred to by a relative reference
         * rather than an absolute reference. This attribute is used if posRef is set to true.
         *
         * A value of 1 or true indicates the item is referred to by a relative reference.
         *
         * A value of 0 or false indicates the item is referred to by an absolute reference.
         */
        relative: null,
        /**
         * @cfg {Boolean} [selected]
         *
         * Specifies a boolean value that indicates whether this field has selection. This attribute is
         * used when the PivotTable is in Outline view. It is also used when both header and data cells
         * have selection.
         *
         * A value of 1 or true indicates the field has selection.
         *
         * A value of 0 or false indicates the field does not have selection.
         */
        selected: null,
        /**
         * @cfg {Boolean} [stdDevPSubtotal]
         *
         * Specifies a boolean value that indicates whether the population standard deviation aggregate
         * function is included in the filter.
         *
         * A value of 1 or true indicates the population standard deviation aggregation function is
         * included in the filter.
         *
         * A value of 0 or false indicates another aggregation function is included in the filter.
         */
        stdDevPSubtotal: null,
        /**
         * @cfg {Boolean} [stdDevSubtotal]
         *
         * Specifies a boolean value that indicates whether the standard deviation aggregate function
         * is included in the filter.
         *
         * A value of 1 or true indicates the standard deviation aggregation function is included in
         * the filter.
         *
         * A value of 0 or false indicates another aggregation function is included in the filter.
         */
        stdDevSubtotal: null,
        /**
         * @cfg {Boolean} [sumSubtotal]
         *
         * Specifies a boolean value that indicates whether the sum aggregate function is included
         * in the filter.
         *
         * A value of 1 or true indicates the sum aggregation function is included in the filter.
         *
         * A value of 0 or false indicates another aggregation function is included in the filter.
         */
        sumSubtotal: null,
        /**
         * @cfg {Boolean} [varPSubtotal]
         *
         * Specifies a boolean value that indicates whether the population variance aggregate function
         * is included in the filter.
         *
         * A value of 1 or true indicates the population variance aggregation function is included
         * in the filter.
         *
         * A value of 0 or false indicates another aggregation function is included in the filter.
         */
        varPSubtotal: null,
        /**
         * @cfg {Boolean} [varSubtotal]
         *
         * Specifies a boolean value that indicates whether the variance aggregate function is included
         * in the filter.
         *
         * A value of 1 or true indicates the variance aggregation function is included in the filter.
         *
         * A value of 0 or false indicates another aggregation function is included in the filter.
         */
        varSubtotal: null,
        /**
         * @cfg {Number[]} [items]
         *
         * Selected items within the selected fields.
         */
        items: []
    },
    tplNonAttributes: [
        'items'
    ],
    /**
     * @cfg generateTplAttributes
     * @inheritdoc Ext.exporter.file.ooxml.Base#cfg!generateTplAttributes
     * @localdoc
     *
     * **Note** Do not rename the config names that are part of the `attributes` since they are
     * mapped to the xml attributes needed by the template.
     */
    generateTplAttributes: true,
    tpl: [
        '<reference {attributes}>',
        '<tpl if="items"><tpl for="items"><x v="{.}"/></tpl></tpl>',
        '</reference>'
    ],
    getCount: function() {
        return this.getItems().length;
    },
    applyItems: function(items) {
        return items !== null ? Ext.Array.from(items) : null;
    }
});

/**
 * Rule describing a PivotTable selection.
 *
 * (CT_PivotArea)
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.excel.PivotArea', {
    extend: 'Ext.exporter.file.ooxml.Base',
    requires: [
        'Ext.exporter.file.ooxml.excel.PivotAreaReference'
    ],
    config: {
        /**
         * @cfg {Boolean} [axis]
         *
         * The region of the PivotTable to which this rule applies.
         *
         * Possible values:
         *
         * - `axisCol` (Column Axis): Column axis
         * - `axisPage` (Include Count Filter): Page axis
         * - `axisRow` (Row Axis): Row axis
         * - `axisValues` (Values Axis): Values axis
         */
        axis: null,
        /**
         * @cfg {Boolean} [cacheIndex]
         *
         * Flag indicating whether any indexes refer to fields or items in the Pivot cache and not the view.
         */
        cacheIndex: null,
        /**
         * @cfg {Boolean} [collapsedLevelsAreSubtotals]
         *
         * Flag indicating if collapsed levels/dimensions are considered subtotals.
         */
        collapsedLevelsAreSubtotals: null,
        /**
         * @cfg {Boolean} [dataOnly]
         *
         * Flag indicating whether only the data values (in the data area of the view) for an item selection
         * are selected and does not include the item labels.
         */
        dataOnly: null,
        /**
         * @cfg {Number} [field]
         *
         * Index of the field that this selection rule refers to.
         */
        field: null,
        /**
         * @cfg {Number} [fieldPosition]
         *
         * Position of the field within the axis to which this rule applies.
         */
        fieldPosition: null,
        /**
         * @cfg {Boolean} [grandCol]
         *
         * Flag indicating whether the column grand total is included.
         */
        grandCol: null,
        /**
         * @cfg {Boolean} [grandRow]
         *
         * Flag indicating whether the row grand total is included.
         */
        grandRow: null,
        /**
         * @cfg {Boolean} [labelOnly]
         *
         * Flag indicating whether only the item labels for an item selection are selected and does
         * not include the data values (in the data area of the view).
         */
        labelOnly: null,
        /**
         * @cfg {String} [offset]
         *
         * A Reference that specifies a subset of the selection area. Points are relative to the
         * top left of the selection area.
         *
         * A reference identifies a cell or a range of cells on a worksheet and tells the application
         * where to look for the values or data you want to use in a formula. With references, you can
         * use data contained in different parts of a worksheet in one formula or use the value from one
         * cell in several formulas. You can also refer to cells on other sheets in the same workbook,
         * and to other workbooks. References to cells in other workbooks are called links.
         */
        offset: null,
        /**
         * @cfg {Boolean} [outline]
         *
         * Flag indicating whether the rule refers to an area that is in outline mode.
         */
        outline: null,
        /**
         * @cfg {String} [type]
         *
         * Indicates the type of selection rule.
         *
         * Possible values:
         *
         *  - `all` (All): Refers to the whole PivotTable.
         *  - `button` (Field Button): Refers to a field button.
         *  - `data` (Data): Refers to something in the data area.
         *  - `none` (None): Refers to no Pivot area.
         *  - `normal` (Normal): Refers to a header or item.
         *  - `origin` (Origin): Refers to the blank cells at the top-left of the PivotTable
         *  (top-left to LTR sheets, top-right for RTL sheets).
         *  - `topEnd` (Top End): Refers to the blank cells at the top of the PivotTable, on its
         *  trailing edge (top-right for LTR sheets, top-left for RTL sheets).
         */
        type: null,
        /**
         * @cfg {Ext.exporter.file.ooxml.excel.PivotAreaReference[]} references
         */
        references: null
    },
    tplNonAttributes: [
        'references'
    ],
    /**
     * @cfg generateTplAttributes
     * @inheritdoc Ext.exporter.file.ooxml.Base#cfg!generateTplAttributes
     * @localdoc
     *
     * **Note** Do not rename the config names that are part of the `attributes` since they are
     * mapped to the xml attributes needed by the template.
     */
    generateTplAttributes: true,
    tpl: [
        '<pivotArea {attributes}>',
        '<tpl if="references"><references count="{references.length}"><tpl for="references.getRange()">{[values.render()]}</tpl></references></tpl>',
        '</pivotArea>'
    ],
    applyReferences: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.file.ooxml.excel.PivotAreaReference');
    }
});

/**
 * Represents the sorting scope for the PivotTable.
 *
 * (CT_AutoSortScope)
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.excel.AutoSortScope', {
    extend: 'Ext.exporter.file.ooxml.Base',
    requires: [
        'Ext.exporter.file.ooxml.excel.PivotArea'
    ],
    config: {
        /**
         * @cfg {Ext.exporter.file.ooxml.excel.PivotArea} pivotArea
         *
         * PivotArea where sorting applies to.
         */
        pivotArea: {}
    },
    tpl: [
        '<autoSortScope>{[values.pivotArea.render()]}</autoSortScope>'
    ],
    destroy: function() {
        this.setPivotArea(null);
        this.callParent();
    },
    applyPivotArea: function(data) {
        if (!data || data.isInstance) {
            return data;
        }
        return new Ext.exporter.file.ooxml.excel.PivotArea(data);
    },
    updatePivotArea: function(data, oldData) {
        Ext.destroy(oldData);
    }
});

/**
 * Represents a single field in the PivotTable. This element contains information about the field,
 * including the collection of items in the field.
 *
 * (CT_PivotField)
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.excel.PivotField', {
    extend: 'Ext.exporter.file.ooxml.Base',
    requires: [
        'Ext.exporter.file.ooxml.excel.FieldItem',
        'Ext.exporter.file.ooxml.excel.AutoSortScope'
    ],
    config: {
        /**
         * @cfg {Boolean} [allDrilled]
         *
         * Specifies a boolean value that indicates whether all items in the field are expanded.
         * Applies only to OLAP PivotTables.
         *
         * A value of 1 or true indicates all items in the field are expanded.
         *
         * A value of 0 or false indicates all items are not expanded. However some items might be
         * expanded.
         */
        allDrilled: null,
        /**
         * @cfg {Boolean} [autoShow]
         *
         * Specifies a boolean value that indicates whether an "AutoShow" filter is applied to this
         * field. This attribute depends on the implementation of filtering in the application.
         *
         * A value of 1 or true indicates an "AutoShow" filter is applied to the field.
         *
         * A value of 0 or false indicates an "AutoShow" filter is not applied.
         */
        autoShow: null,
        /**
         * @cfg {Boolean} [avgSubtotal]
         *
         * Specifies a boolean value that indicates whether to apply the 'Average' aggregation function
         * in the subtotal of this field.
         *
         * A value of 1 or true indicates the subtotal for this field is 'Average.'
         *
         * A value of 0 or false indicates a different aggregation function is applied to the subtotal
         * for this field.
         */
        avgSubtotal: null,
        /**
         * @cfg {String} [axis]
         *
         * Specifies the region of the PivotTable that this field is displayed.
         *
         * Possible values:
         *
         * - `axisCol`: Column axis
         * - `axisPage`: Page axis
         * - `axisRow`: Row axis
         * - `axisValues`: Values axis
         */
        axis: null,
        /**
         * @cfg {Boolean} [compact]
         *
         * Specifies a boolean value that indicates whether the application will display fields compactly
         * in the sheet on which this PivotTable resides.
         *
         * A value of 1 or true indicates the next field should be displayed in the same column of the sheet.
         *
         * A value of 0 or false indicates each pivot field will display in its own column in the sheet.
         */
        compact: null,
        /**
         * @cfg {Boolean} [countASubtotal]
         *
         * Specifies a boolean value that indicates whether to apply the 'countA' aggregation function in the
         * subtotal of this field.
         *
         * A value of 1 or true indicates the subtotal for this field is 'countA.'
         *
         * A value of 0 or false indicates a different aggregation function is applied to the subtotal
         * for this field.
         */
        countASubtotal: null,
        /**
         * @cfg {Boolean} [countSubtotal]
         *
         * Specifies a boolean value that indicates whether to apply the 'count' aggregation function in the
         * subtotal of this field.
         *
         * A value of 1 or true indicates the subtotal for this field is 'count.'
         *
         * A value of 0 or false indicates a different aggregation vfunction is applied to the subtotal
         * for this field.
         */
        countSubtotal: null,
        /**
         * @cfg {Boolean} [dataField]
         *
         * Specifies a boolean value that indicates whether this field appears in the data region
         * of the PivotTable.
         *
         * A value of 1 or true indicates this field appears in the data region of the PivotTable.
         *
         * A value of 0 or false indicates this field appears in another region of the PivotTable.
         */
        dataField: null,
        /**
         * @cfg {Boolean} [dataSourceSort]
         *
         * Specifies a boolean value that indicates whether sort is applied to this field in the data source.
         *
         * A value of 1 or true indicates this field is sorted in the data source.
         *
         * A value of 0 or false indicates this field is not sorted in the data source.
         */
        dataSourceSort: null,
        /**
         * @cfg {Boolean} [defaultAttributeDrillState]
         *
         * Specifies a boolean value that indicates the drill state of the attribute hierarchy in an
         * OLAP-based PivotTable.
         *
         * A value of 1 or true indicates the attribute hierarchy is expanded.
         *
         * A value of 0 or false indicates the attribute hierarchy is collapsed.
         *
         * This attribute is designed to allow the application to issue more optimized queries when all
         * items of each field have the same drill state.
         */
        defaultAttributeDrillState: null,
        /**
         * @cfg {Boolean} [defaultSubtotal]
         *
         * Specifies a boolean value that indicates whether the default subtotal aggregation function
         * is displayed for this field.
         *
         * A value of 1 or true indicates the default subtotal aggregation function is displayed for this field.
         *
         * A value of 0 or false indicates the default aggregation function is not displayed.
         */
        defaultSubtotal: null,
        /**
         * @cfg {Boolean} [dragOff]
         *
         * Specifies a boolean value that indicates whether the field can be removed from the PivotTable.
         *
         * A value of 1 or true indicates the field can be removed from the PivotTable.
         *
         * A value of 0 or false indicates the field cannot be removed from the PivotTable.
         */
        dragOff: null,
        /**
         * @cfg {Boolean} [dragToCol]
         *
         * Specifies a boolean value that indicates whether the field can be dragged to the column axis.
         *
         * A value of 1 or true indicates the field can be dragged to the column axis.
         *
         * A value of 0 or false indicates the field cannot be dragged to the column axis.
         */
        dragToCol: null,
        /**
         * @cfg {Boolean} [dragToData]
         *
         * Specifies a boolean value that indicates whether the field can be dragged to the data region.
         *
         * A value of 1 or true indicates the field can be dragged to the data region.
         *
         * A value of 0 or false indicates the field cannot be dragged to the data region.
         */
        dragToData: null,
        /**
         * @cfg {Boolean} [dragToPage]
         *
         * Specifies a boolean value that indicates whether the field can be dragged to the page region.
         *
         * A value of 1 or true indicates the field can be dragged to the page region.
         *
         * A value of 0 or false indicates the field cannot be dragged to the page region.
         */
        dragToPage: null,
        /**
         * @cfg {Boolean} [dragToRow]
         *
         * Specifies a boolean value that indicates whether the field can be dragged to the row axis.
         *
         * A value of 1 or true indicates the field can be dragged to the row axis.
         *
         * A value of 0 or false indicates the field cannot be dragged to the row axis.
         */
        dragToRow: null,
        /**
         * @cfg {Boolean} [hiddenLevel]
         *
         * Specifies a boolean value that indicates whether there is a hidden level in the PivotTable.
         * This attribute applies to OLAP-based PivotTables only.
         *
         * A value of 1 or true indicates the OLAP PivotTable contains a hidden level.
         *
         * A value of 0 or false indicates the OLAP PivotTable does not contain any hidden levels.
         */
        hiddenLevel: null,
        /**
         * @cfg {Boolean} [hideNewItems]
         *
         * Specifies a boolean value that indicates whether new items that appear after a refresh should
         * be hidden by default.
         *
         * A value of 1 or true indicates that items that appear after a refresh should be hidden by default.
         *
         * A value of 0 or false indicates that items that appear after a refresh should be shown by default.
         */
        hideNewItems: null,
        /**
         * @cfg {Boolean} [includeNewItemsInFilter]
         *
         * Specifies a boolean value that indicates whether manual filter is in inclusive mode.
         *
         * A value of 1 or true indicates the manual filter is inclusive.
         *
         * A value of 0 or false indicates the manual filter is not inclusive.
         */
        includeNewItemsInFilter: null,
        /**
         * @cfg {Boolean} [insertBlankRow]
         *
         * Specifies a boolean value that indicates whether to insert a blank row after each item.
         *
         * A value of 1 or true indicates that a blank row is inserted after each item.
         *
         * A value of 0 or false indicates no additional rows are inserted after each item.
         */
        insertBlankRow: null,
        /**
         * @cfg {Boolean} [insertPageBreak]
         *
         * Specifies a boolean value that indicates whether to insert a page break after each item.
         *
         * A value of 1 or true indicates that a page break is inserted after each item.
         *
         * A value of 0 or false indicates no page breaks are inserted after items.
         */
        insertPageBreak: null,
        /**
         * @cfg {Number} [itemPageCount]
         *
         * Specifies the number of items showed per page in the PivotTable.
         */
        itemPageCount: null,
        /**
         * @cfg {Boolean} [maxSubtotal]
         *
         * Specifies a boolean value that indicates whether to apply the 'max' aggregation function
         * in the subtotal of this field.
         *
         * A value of 1 or true indicates that the 'max' aggregation function is applied in the subtotal
         * for this field.
         *
         * A value of 0 or false indicates another aggregation function is applied in the subtotal
         * for this field.
         */
        maxSubtotal: null,
        /**
         * @cfg {Boolean} [measureFilter]
         *
         * Specifies a boolean value that indicates whether field has a measure based filter.
         *
         * A value of 1 or true indicates the field has a measure-based filter.
         *
         * A value of 0 or false indicates does not have a measure-based filter.
         */
        measureFilter: null,
        /**
         * @cfg {Boolean} [minSubtotal]
         *
         * Specifies a boolean value that indicates whether to apply the 'min' aggregation function
         * in the subtotal of this field.
         *
         * A value of 1 or true indicates that the 'min' aggregation function is applied in the subtotal
         * for this field.
         *
         * A value of 0 or false indicates another aggregation function is applied in the subtotal
         * for this field.
         */
        minSubtotal: null,
        /**
         * @cfg {Boolean} [multipleItemSelectionAllowed]
         *
         * Specifies a boolean value that indicates whether the field can have multiple items selected
         * in the page field.
         *
         * A value of 1 or true indicates the PivotTable can have multiple items selected in the page field.
         *
         * A value of 0 or false indicates the PivotTable cannot have multiple items selected in the page
         * field. This attribute depends on the application support for selecting multiple items in page fields.
         */
        multipleItemSelectionAllowed: null,
        /**
         * @cfg {Boolean} [nonAutoSortDefault]
         *
         * Specifies a boolean value that indicates whether sort operation that is applied to field should
         * be AutoSort operation or simple data sort operation.
         *
         * A value of 1 or true indicates that an AutoSort operation is applied to the field.
         *
         * A value of 0 or false indicates a simple data sort operation is applied to the field.
         */
        nonAutoSortDefault: null,
        /**
         * @cfg {Number} [numFmtId]
         *
         * Specifies the identifier of the number format to apply to this field. Number formats are written
         * to the styles part. See the Styles section (§18.8) for more information on number formats.
         *
         * Formatting information provided by cell table and by PivotTable need not agree. If the two formats
         * differ, the cell-level formatting takes precedence. If you change the layout the PivotTable,
         * the PivotTable formatting will then take precedence.
         */
        numFmtId: null,
        /**
         * @cfg {Boolean} [outline]
         *
         * Specifies a boolean value that indicates whether the items in this field should be shown in Outline form.
         *
         * A value of 1 or true indicates the items in this field is shown in Outline form.
         *
         * A value of 0 or false indicates the items in this field will not be shown in Outline form.
         *
         * This attribute depends on the application support for displaying items in Outline form.
         */
        outline: null,
        /**
         * @cfg {Boolean} [productSubtotal]
         *
         * Specifies a boolean value that indicates whether to apply 'product' aggregation function
         * in the subtotal of this field.
         *
         * A value of 1 or true indicates that the 'product' aggregation function is applied in the subtotal
         * for this field.
         *
         * A value of 0 or false indicates another aggregation function is applied in the subtotal
         * for this field.
         */
        productSubtotal: null,
        /**
         * @cfg {Number} [rankBy]
         *
         * Specifies the index of the data field by which AutoShow will rank.
         */
        rankBy: null,
        /**
         * @cfg {Boolean} [serverField]
         *
         * Specifies a boolean value that indicates whether this is a server-based page field.
         *
         * A value of 1 or true indicates this is a server-based page field.
         *
         * A value of 0 or false indicates this is a local page field.
         */
        serverField: null,
        /**
         * @cfg {Boolean} [showAll]
         *
         * Specifies a boolean value that indicates whether to show all items for this field.
         *
         * A value of 1 or true indicates that all items be shown.
         *
         * A value of 0 or false indicates items be shown according to user specified criteria.
         */
        showAll: null,
        /**
         * @cfg {Boolean} [showDropDowns]
         *
         * Specifies a boolean value that indicates whether to hide drop down buttons on PivotField headers.
         * This attribute depends on the application implementation for filtering in the user interface.
         *
         * A value of 1 or true indicates the application will display some mechanism for selecting and
         * applying filters – [Example: A dropdown menu end example] – in the user interface.
         *
         * A value of 0 or false indicates for mechanism for applying a filter is displayed in the user interface.
         */
        showDropDowns: null,
        /**
         * @cfg {Boolean} [showPropAsCaption]
         *
         * Specifies a boolean value that indicates whether to show the property as a member caption.
         *
         * A value of 1 or true indicates the property is shown as a member caption.
         *
         * A value of 0 or false indicates the property will not be shown as a member caption.
         */
        showPropAsCaption: null,
        /**
         * @cfg {Boolean} [showPropCell]
         *
         * Specifies a boolean value that indicates whether to show the member property value in a PivotTable cell.
         *
         * A value of 1 or true indicates the property value is shown in a PivotTable cell.
         *
         * A value of 0 or false indicates the property value will not be shown in a PivotTable cell.
         */
        showPropCell: null,
        /**
         * @cfg {Boolean} [showPropTip]
         *
         * Specifies a boolean value that indicates whether to show the member property value in a
         * tooltip on the appropriate PivotTable cells.
         *
         * A value of 1 or true indicates the property value is shown in a tooltip in the user interface.
         *
         * A value of 0 or false indicates the property will not be shown in a tooltip. This attribute depends
         * on whether the application employs tooltips or similar mechanism in the user interface.
         */
        showPropTip: null,
        /**
         * @cfg {String} [sortType]
         *
         * Specifies the type of sort that is applied to this field.
         *
         * Possible values:
         *
         * - `ascending`: Indicates the field is sorted in ascending order.
         * - `descending`: Indicates the field is sorted in descending order.
         * - `manual`: Indicates the field is sorted manually.
         */
        sortType: null,
        /**
         * @cfg {Boolean} [stdDevPSubtotal]
         *
         * Specifies a boolean value that indicates whether to apply the 'stdDevP' aggregation function in
         * the subtotal of this field.
         *
         * A value of 1 or true indicates that the 'stdDevP' aggregation function is applied in the subtotal
         * for this field.
         *
         * A value of 0 or false indicates another aggregation function is applied in the subtotal
         * for this field.
         */
        stdDevPSubtotal: null,
        /**
         * @cfg {Boolean} [stdDevSubtotal]
         *
         * Specifies a boolean value that indicates whether to use 'stdDev' in the subtotal of this field.
         *
         * A value of 1 or true indicates that the 'stdDev' aggregation function is applied in the subtotal
         * for this field.
         *
         * A value of 0 or false indicates another aggregation function is applied in the subtotal
         * for this field.
         */
        stdDevSubtotal: null,
        /**
         * @cfg {String} [subtotalCaption]
         *
         * Specifies the custom text that is displayed for the subtotals label.
         */
        subtotalCaption: null,
        /**
         * @cfg {Boolean} [subtotalTop]
         *
         * Specifies a boolean value that indicates whether to display subtotals at the top of the group.
         * Applies only when Outline its true.
         *
         * A value of 1 or true indicates a subtotal is display at the top of the group.
         *
         * A value of 0 or false indicates subtotal will not be displayed at the top of the group.
         */
        subtotalTop: null,
        /**
         * @cfg {Boolean} [sumSubtotal]
         *
         * Specifies a boolean value that indicates whether apply the 'sum' aggregation function in
         * the subtotal of this field.
         *
         * A value of 1 or true indicates the 'sum' aggregation function is applied in the subtotal of this field.
         *
         * A value of 0 or false indicates another aggregation function is applied in the subtotal of this field.
         */
        sumSubtotal: null,
        /**
         * @cfg {Boolean} [topAutoShow]
         *
         * Specifies a boolean value that indicates whether an AutoShow filter applied to this field is set
         * to show the top ranked values.
         *
         * A value of 1 or true indicates whether an AutoShow filter will show top values for this field.
         *
         * A value of 0 or false indicates bottom ranked values are shown.
         */
        topAutoShow: null,
        /**
         * @cfg {String} [uniqueMemberProperty]
         *
         * Specifies the unique name of the member property to be used as a caption for the field and field items.
         */
        uniqueMemberProperty: null,
        /**
         * @cfg {Boolean} [varPSubtotal]
         *
         * Specifies a boolean value that indicates whether to apply the 'varP' aggregation function in
         * the subtotal of this field.
         *
         * A value of 1 or true indicates the 'varP' aggregation function is applied in the subtotal of this field.
         *
         * A value of 0 or false indicates another aggregation function is applied in the subtotal of this field.
         */
        varPSubtotal: null,
        /**
         * @cfg {Boolean} [varSubtotal]
         *
         * Specifies a boolean value that indicates whether to apply the 'variance' aggregation function
         * in the subtotal of this field.
         *
         * A value of 1 or true indicates the 'variance' aggregation function is applied in the subtotal of this field.
         *
         * A value of 0 or false indicates another aggregation function is applied in the subtotal of this field.
         */
        varSubtotal: null,
        /**
         * @cfg {Ext.exporter.file.ooxml.excel.FieldItem[]} [items]
         *
         * Represents the collection of items in a PivotTable field. The items in the collection are ordered by index.
         *
         * Items represent the unique entries from the field in the source data.
         */
        items: null,
        /**
         * @cfg {Ext.exporter.file.ooxml.excel.AutoSortScope} [autoSortScope]
         *
         * Represents the sorting scope for the PivotTable.
         */
        autoSortScope: null
    },
    tplNonAttributes: [
        'items',
        'autoSortScope'
    ],
    /**
     * @cfg generateTplAttributes
     * @inheritdoc Ext.exporter.file.ooxml.Base#cfg!generateTplAttributes
     * @localdoc
     *
     * **Note** Do not rename the config names that are part of the `attributes` since they are
     * mapped to the xml attributes needed by the template.
     */
    generateTplAttributes: true,
    tpl: [
        '<tpl if="items || autoSortScope">',
        '<pivotField {attributes}>',
        '<tpl if="items"><items count="{items.length}"><tpl for="items.getRange()">{[values.render()]}</tpl></items></tpl>',
        '<tpl if="autoSortScope">{[values.autoSortScope.render()]}</tpl>',
        '</pivotField>',
        '<tpl else>',
        '<pivotField {attributes} />',
        '</tpl>'
    ],
    destroy: function() {
        this.setAutoSortScope(null);
        this.callParent();
    },
    applyItems: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.file.ooxml.excel.FieldItem');
    },
    applyAutoSortScope: function(data) {
        if (!data || data.isInstance) {
            return data;
        }
        return new Ext.exporter.file.ooxml.excel.AutoSortScope(data);
    },
    updateAutoSortScope: function(data, oldData) {
        Ext.destroy(oldData);
    }
});

/**
 * Represents a generic field that can appear either on the column or the row region of the PivotTable.
 * There areas many <x> elements as there are item values in any particular column or row.
 *
 * (CT_Field)
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.excel.Field', {
    extend: 'Ext.exporter.file.ooxml.Base',
    config: {
        /**
         * @cfg {Number} [x]
         *
         * Specifies the index to a pivotField item value. There are as many x elements as there
         * are item values in any particular column. Note that these x elements sometimes are not
         * explicitly written, but instead "inherited" from the previous column or i element, via
         * the value of @r. The pivotField items don't list values explicitly, but instead reference
         * a shared item value in the pivotCacheDefinition part. The first instance of x has no
         * attribute value @v associated with it, so the default value for @v is assumed to be "0".
         */
        x: null
    },
    tpl: [
        '<field x="{x}"/>'
    ]
});

/**
 * Represents the collection of items in the row region of the PivotTable.
 *
 * (CT_I)
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.excel.Item', {
    extend: 'Ext.exporter.file.ooxml.Base',
    config: {
        /**
         * @cfg {Number} [i]
         *
         * Specifies a zero-based index indicating the referenced data item it in a data field
         * with multiple data items.
         */
        i: null,
        /**
         * @cfg {Number} [r]
         *
         * Specifies the number of items to repeat from the previous row item. The first item
         * has no @r explicitly written. Since a default of "0" is specified in the schema, for any
         * item whose @r is missing, a default value of "0" is implied.
         */
        r: null,
        /**
         * @cfg {Number} [t]
         *
         * Specifies the type of the item. Value of 'default' indicates a grand total as the
         * last row item value
         *
         * Possible values:
         *
         *  - `avg` (Average): Indicates the pivot item represents an "average" aggregate function.
         *  - `blank` (Blank Pivot Item): Indicates the pivot item represents a blank line.
         *  - `count` (Count): Indicates the pivot item represents custom the "count" aggregate."
         *  - `countA` (CountA): Indicates the pivot item represents the "count numbers" aggregate function.
         *  - `data` (Data): Indicate the pivot item represents data.
         *  - `default` (Default): Indicates the pivot item represents the default type for this PivotTable.
         *  The default pivot item type is the "total" aggregate function.
         *  - `grand` (Grand Total Item): Indicates the pivot items represents the grand total line.
         *  - `max` (Max): Indicates the pivot item represents the "maximum" aggregate function.
         *  - `min` (Min): Indicates the pivot item represents the "minimum" aggregate function.
         *  - `product` (Product): Indicates the pivot item represents the "product" function.
         *  - `stdDev` (stdDev): Indicates the pivot item represents the "standard deviation" aggregate function.
         *  - `stdDevP` (StdDevP): Indicates the pivot item represents the "standard deviation population" aggregate function.
         *  - `sum` (Sum): Indicates the pivot item represents the "sum" aggregate value.
         *  - `var` (Var): Indicates the pivot item represents the "variance" aggregate value.
         *  - `varP` (VarP): Indicates the pivot item represents the "variance population" aggregate value.
         */
        t: null,
        /**
         * @cfg {Number[]} [x]
         *
         * Represents an array of indexes to cached member property values.
         *
         * Each item specifies the index into the shared items table in the PivotCache that identifies this item.
         */
        x: null
    },
    tpl: [
        '<tpl if="x"><i{attr}>{x}</i><tpl else><i{attr}/></tpl>'
    ],
    getRenderData: function() {
        var data = this.callParent(),
            len = data.x ? data.x.length : 0,
            str = '',
            attr = '',
            i;
        for (i = 0; i < len; i++) {
            if (data.x[i] > 0) {
                str += '<x v="' + data.x[i] + '"/>';
            } else {
                str += '<x/>';
            }
        }
        data.x = str;
        if (data.t) {
            attr += ' t="' + data.t + '"';
        }
        if (data.r > 0) {
            attr += ' r="' + data.r + '"';
        }
        if (data.i > 0) {
            attr += ' i="' + data.i + '"';
        }
        data.attr = attr;
        return data;
    },
    applyX: function(data) {
        return data != null ? Ext.Array.from(data) : null;
    }
});

/**
 * Represents a field from a source list, table, or database that contains data
 * that is summarized in a PivotTable.
 *
 * (CT_DataField)
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.excel.DataField', {
    extend: 'Ext.exporter.file.ooxml.Base',
    config: {
        /**
         * @cfg {Number} [baseField]
         *
         * Specifies the index to the base field when the ShowDataAs calculation is in use.
         */
        baseField: null,
        /**
         * @cfg {Number} [baseItem]
         *
         * Specifies the index to the base item when the ShowDataAs calculation is in use.
         */
        //baseItem: 1048832,
        baseItem: null,
        /**
         * @cfg {Number} fld (required)
         *
         * Specifies the index to the field (<r>) in the pivotCacheRecords part that this data item summarizes.
         */
        fld: null,
        /**
         * @cfg {String} [name]
         *
         * Specifies the name of the data field.
         */
        name: null,
        /**
         * @cfg {Number} [numFmtId]
         *
         * Specifies the index to the number format applied to this data field. Number formats are written
         * to the styles part. See the Styles section(§18.8) for more information on number formats.
         *
         * Formatting information provided by cell table and by PivotTable need not agree. If the two formats
         * differ, the cell-level formatting takes precedence. If you change the layout of
         * the PivotTable, the PivotTable formatting will then take precedence.
         */
        numFmtId: null,
        /**
         * @cfg {String} [showDataAs]
         *
         * Specifies the display format for this data field.
         * Formatting information provided by cell table and by PivotTable need not agree. If the two
         * formats differ, the cell-level formatting takes precedence. If you change the layout of the PivotTable,
         * the PivotTable formatting will then take precedence.
         *
         * Possible values:
         *
         *  - `difference` (Difference): Indicates the field is shown as the "difference from" a value.
         *  - `index` (Index): Indicates the field is shown as the "index.
         *  - `normal` (Normal Data Type): Indicates that the field is shown as its normal data type.
         *  - `percent` (Percentage Of): Indicates the field is show as the "percentage of
         *  - `percentDiff` (Percentage Difference): Indicates the field is shown as the "percentage difference
         *  from" a value.
         *  - `percentOfCol` (Percent of Column): Indicates the field is shown as the percentage of column.
         *  - `percentOfRow` (Percentage of Row): Indicates the field is shown as the percentage of row
         *  - `percentOfTotal` (Percentage of Total): Indicates the field is shown as percentage of total.
         *  - `runTotal` (Running Total): Indicates the field is shown as running total in the table.
         */
        showDataAs: null,
        /**
         * @cfg {String} [subtotal]
         *
         * Specifies the aggregation function that applies to this data field.
         *
         * Possible values:
         *
         *  - `average (Average): The average of the values.
         *  - `count (Count): The number of data values. The Count consolidation function works the same as
         *  the COUNTA worksheet function.
         *  - `countNums (CountNums): The number of data values that are numbers. The Count Nums consolidation
         *  function works the same as the COUNT worksheet function.
         *  - `max (Maximum): The largest value.
         *  - `min (Minimum): The smallest value.
         *  - `product (Product): The product of the values.
         *  - `stdDev (StdDev): An estimate of the standard deviation of a population, where the sample is a
         *  subset of the entire population.
         *  - `stdDevp (StdDevP): The standard deviation of a population, where the population is all of the
         *  data to be summarized.
         *  - `sum (Sum): The sum of the values.
         *  - `var (Variance): An estimate of the variance of a population, where the sample is a subset of
         *  the entire population.
         *  - `varp (VarP): The variance of a population, where the population is all of the data to be
         *  summarized.
         */
        subtotal: null
    },
    /**
     * @cfg generateTplAttributes
     * @inheritdoc Ext.exporter.file.ooxml.Base#cfg!generateTplAttributes
     * @localdoc
     *
     * **Note** Do not rename the config names that are part of the `attributes` since they are
     * mapped to the xml attributes needed by the template.
     */
    generateTplAttributes: true,
    tpl: [
        '<dataField {attributes}/>'
    ]
});

/**
 * Represents a single record of data in the PivotCache.
 *
 * (CT_Record)
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.excel.Record', {
    extend: 'Ext.exporter.file.ooxml.Base',
    config: {
        /**
         * @cfg {Boolean/Number/Date/String[]} items
         *
         * Cell values for this record
         */
        items: null
    },
    tplNonAttributes: [
        'items',
        'stritems'
    ],
    tpl: [
        '<tpl if="stritems">',
        '<r>',
        '{stritems}',
        '</r>',
        '<tpl else>',
        '<r/>',
        '</tpl>'
    ],
    numberTpl: '<n v="{0}"/>',
    booleanTpl: '<b v="{0}"/>',
    stringTpl: '<s v="{0}"/>',
    dateTpl: '<d v="{0}"/>',
    constructor: function(config) {
        var cfg;
        if (Ext.isArray(config) || Ext.isDate(config) || Ext.isPrimitive(config)) {
            cfg = {
                items: config
            };
        } else {
            cfg = config;
        }
        return this.callParent([
            cfg
        ]);
    },
    getRenderData: function() {
        var me = this,
            data = me.callParent(),
            items = data.items,
            str = '',
            types = [],
            i, len, v, tpl;
        if (items) {
            len = items.length;
            for (i = 0; i < len; i++) {
                v = items[i];
                if (v == null || v === '') {} else //
                {
                    if (typeof v === 'string') {
                        tpl = me.stringTpl;
                        v = Ext.util.Format.htmlEncode(Ext.util.Base64._utf8_encode(v));
                        types.push('s');
                    } else if (typeof v === 'boolean') {
                        tpl = me.booleanTpl;
                        types.push('b');
                    } else if (typeof v === 'number') {
                        tpl = me.numberTpl;
                        types.push('n');
                    } else if (v instanceof Date) {
                        tpl = me.dateTpl;
                        v = Ext.Date.format(v, 'Y-m-d\\TH:i:s.u');
                        types.push('d');
                    }
                    str += Ext.String.format(tpl, v);
                }
            }
        }
        data.stritems = str;
        return data;
    },
    applyItems: function(items) {
        return items !== null ? Ext.Array.from(items) : null;
    }
});

/**
 * Represents the collection of records in the PivotCache. This part stores the underlying
 * source data that the PivotTable aggregates.
 *
 * [CT_PivotCacheRecords]
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.excel.PivotCacheRecords', {
    extend: 'Ext.exporter.file.ooxml.XmlRels',
    requires: [
        'Ext.exporter.file.ooxml.excel.Record'
    ],
    config: {
        items: []
    },
    folder: '/xl/pivotCache/',
    fileName: 'pivotCacheRecords',
    contentType: {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheRecords+xml'
    },
    relationship: {
        schema: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotCacheRecords'
    },
    tpl: [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<pivotCacheRecords xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ',
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" count="{items.length}">',
        '<tpl for="items.getRange()">{[values.render()]}</tpl>',
        '</pivotCacheRecords>'
    ],
    applyItems: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.file.ooxml.excel.Record');
    }
});

/**
 * Represents the location of the source of the data that is stored in the cache.
 *
 * (CT_WorksheetSource)
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.excel.WorksheetSource', {
    extend: 'Ext.exporter.file.ooxml.Base',
    config: {
        /**
         * @cfg {String} id
         *
         * Specifies the identifier to the Sheet part whose data is stored in the cache.
         */
        id: null,
        /**
         * @cfg {String} [name]
         *
         * Specifies the named range that is the source of the data.
         */
        name: null,
        /**
         * @cfg {String} [ref]
         *
         * Specifies the reference that defines a cell range that is the source of the data.
         * This attribute depends on how the application implements cell references.
         */
        ref: null,
        /**
         * @cfg {String} [sheet]
         *
         * Specifies the name of the sheet that is the source for the cached data.
         */
        sheet: null
    },
    autoGenerateId: false,
    tplAttributes: [
        'id',
        'name',
        'ref',
        'sheet'
    ],
    /**
     * @cfg generateTplAttributes
     * @inheritdoc Ext.exporter.file.ooxml.Base#cfg!generateTplAttributes
     * @localdoc
     *
     * **Note** Do not rename the config names that are part of the `attributes` since they are
     * mapped to the xml attributes needed by the template.
     */
    generateTplAttributes: true,
    tpl: [
        '<worksheetSource {attributes} />'
    ]
});

/**
 * Represents the description of data source whose data is stored in the pivot cache. The data
 * source refers to the underlying rows or database records that provide the data for a PivotTable.
 * You can create a PivotTable report from a SpreadsheetML table, an external database (including OLAP cubes),
 * multiple SpreadsheetML worksheets, or another PivotTable.
 *
 * (CT_CacheSource)
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.excel.CacheSource', {
    extend: 'Ext.exporter.file.ooxml.Base',
    requires: [
        'Ext.exporter.file.ooxml.excel.WorksheetSource'
    ],
    config: {
        /**
         * @cfg {String} [type]
         *
         * Specifies the cache type.
         *
         * Possible values:
         *
         *  - `consolidation` (Consolidation Ranges): Indicates that the cache contains data that consolidates ranges.
         *  - `external` (External): Indicates that the cache contains data from an external data source.
         *  - `scenario` (Scenario Summary Report): Indicates that the cache contains a scenario summary report
         *  - `worksheet` (Worksheet): Indicates that the cache contains worksheet data.
         */
        type: 'worksheet',
        /**
         * @cfg {Ext.exporter.file.ooxml.excel.WorksheetSource} [worksheetSource]
         *
         * Represents the location of the source of the data that is stored in the cache.
         */
        worksheetSource: {}
    },
    // TODO: there are more configs available in the standard for OLAP integration
    tplNonAttributes: [
        'worksheetSource'
    ],
    /**
     * @cfg generateTplAttributes
     * @inheritdoc Ext.exporter.file.ooxml.Base#cfg!generateTplAttributes
     * @localdoc
     *
     * **Note** Do not rename the config names that are part of the `attributes` since they are
     * mapped to the xml attributes needed by the template.
     */
    generateTplAttributes: true,
    tpl: [
        '<cacheSource {attributes}>',
        '<tpl if="type == \'worksheet\'">',
        '{[values.worksheetSource.render()]}',
        '</tpl>',
        '</cacheSource>'
    ],
    destroy: function() {
        this.setWorksheetSource(null);
        this.callParent();
    },
    applyWorksheetSource: function(data) {
        if (!data || data.isInstance) {
            return data;
        }
        return new Ext.exporter.file.ooxml.excel.WorksheetSource(data);
    },
    updateWorksheetSource: function(data, oldData) {
        Ext.destroy(oldData);
    }
});

/**
 * Represents the collection of unique items for a field in the PivotCacheDefinition.
 * The sharedItems complex type stores data type and formatting information about the data
 * in a field. Items in the PivotCacheDefinition can be shared in order to reduce the redundancy
 * of those values that are referenced in multiple places across all the PivotTable parts.
 * [Example: A value might be part of a filter, it might appear on a row or column axis, and
 * will appear in the pivotCacheRecords definition as well. However, because of the performance
 * cost of creating the optimized shared items, items are only shared if they are actually in
 * use in the PivotTable. Therefore, depending on user actions on the PivotTable layout, the
 * pivotCacheDefinition and underlying PivotCacheRecords part can be updated. end example]
 *
 * If there are no shared items, then field values are stored directly in the pivotCacheRecords part.
 *
 * (CT_SharedItems)
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.excel.SharedItems', {
    extend: 'Ext.exporter.file.ooxml.Base',
    config: {
        /**
         * @cfg {Boolean} [containsBlank]
         *
         * Specifies a boolean value that indicates whether this field contains a blank value.
         *
         * A value of 1 or true indicates this field contains one or more blank values.
         *
         * A value of 0 or false indicates this field does not contain blank values.
         */
        containsBlank: null,
        /**
         * @cfg {Boolean} [containsDate]
         *
         * Specifies a boolean value that indicates that the field contains at least one date.
         *
         * A value of 1 or true indicates the field contains at least one date value.
         *
         * A value of 0 or false indicates the field does not contain any date values.
         */
        containsDate: null,
        /**
         * @cfg {Boolean} [containsInteger]
         *
         * Specifies a boolean value that indicates whether this field contains integer values.
         *
         * A value of 1 or true indicates this field contains integer values.
         *
         * A value of 0 or false indicates non-integer or mixed values.
         */
        containsInteger: null,
        /**
         * @cfg {Boolean} [containsMixedTypes]
         *
         * Specifies a boolean value that indicates whether this field contains more than one data type.
         *
         * A value of 1 or true indicates this field contains more than one data type.
         *
         * A value of 0 or false indicates contains only one data type. The field can still contain
         * blank values.
         */
        containsMixedTypes: null,
        /**
         * @cfg {Boolean} [containsNonDate]
         *
         * Specifies a boolean value that indicates that the field contains at least one value that is not a date.
         *
         * A value of 1 or true indicates the field contains at least one non-date values.
         *
         * A value of 0 or false indicates this field contains no date fields.
         */
        containsNonDate: null,
        /**
         * @cfg {Boolean} [containsNumber]
         *
         * Specifies a boolean value that indicates whether this field contains numeric values.
         *
         * A value of 1 or true indicates this field contains at least one numeric value.
         *
         * A value of 0 or false indicates this field contains no numeric values.
         */
        containsNumber: null,
        /**
         * @cfg {Boolean} [containsSemiMixedTypes]
         *
         * Specifies a boolean value that indicates that this field contains text values.
         * The field can also contain a mix of other data type and blank values.
         *
         * A value of 1 or true indicates at least one text value, and can also contain a mix of other
         * data types and blank values.
         *
         * A value of 0 or false indicates the field does not have a mix of text and other values.
         */
        containsSemiMixedTypes: null,
        /**
         * @cfg {Boolean} [containsString]
         *
         * Specifies a boolean value that indicates whether this field contains a text value.
         *
         * A value of 1 or true indicates this field contains at least one text value.
         *
         * A value of 0 or false indicates this field does not contain any text values.
         */
        containsString: null,
        /**
         * @cfg {Boolean} [longText]
         *
         * Specifies a boolean value that indicates whether this field contains a long text value.
         * A string is considered long if it is over 255 Unicode scalar values.
         *
         * A value of 1 or true indicates the value contains more than 255 Unicode scalar valuesof text.
         *
         * A value of 0 or false indicates the value contains less than 255 Unicode scalar values.
         *
         * **Note**: This is used as many legacy spreadsheet application support a limit of 255
         * characters for text values.
         */
        longText: null,
        /**
         * @cfg {Date} [maxDate]
         *
         * Specifies the maximum date/time value found in a date field.
         */
        maxDate: null,
        /**
         * @cfg {Number} [maxValue]
         *
         * Specifies the maximum numeric value found in a numeric field.
         */
        maxValue: null,
        /**
         * @cfg {Date} [minDate]
         *
         * Specifies the minimum date/time value found in a date field.
         */
        minDate: null,
        /**
         * @cfg {Number} [minValue]
         *
         * Specifies the minimum numeric value found in a numeric field.
         */
        minValue: null,
        /**
         * @cfg {Boolean/Number/Date/String[]} items
         *
         * Unique values for the CacheField.
         */
        items: null
    },
    tplNonAttributes: [
        'items',
        'stritems'
    ],
    /**
     * @cfg generateTplAttributes
     * @inheritdoc Ext.exporter.file.ooxml.Base#cfg!generateTplAttributes
     * @localdoc
     *
     * **Note** Do not rename the config names that are part of the `attributes` since they are
     * mapped to the xml attributes needed by the template.
     */
    generateTplAttributes: true,
    tpl: [
        '<tpl if="stritems">',
        '<sharedItems {attributes}>',
        '{stritems}',
        '</sharedItems>',
        '<tpl else>',
        '<sharedItems {attributes}/>',
        '</tpl>'
    ],
    numberTpl: '<n v="{0}"/>',
    booleanTpl: '<b v="{0}"/>',
    stringTpl: '<s v="{0}"/>',
    dateTpl: '<d v="{0}"/>',
    getRenderData: function() {
        var me = this,
            data = me.callParent(),
            items = data.items,
            str = '',
            hasBlank = false,
            hasBool = false,
            hasNumber = false,
            hasDate = false,
            hasString = false,
            hasFloat = false,
            count = 0,
            types = [],
            minValue = null,
            maxValue = null,
            i, len, v, tpl;
        // the CT_SharedItems specs is not fully implemented in this class
        // there are more elements inside "sharedItems" with settings for OLAP
        // we currently ignore OLAP
        if (items) {
            len = items.length;
            for (i = 0; i < len; i++) {
                v = items[i];
                if (v == null || v === '') {
                    hasBlank = true;
                } else {
                    count++;
                    if (typeof v === 'string') {
                        hasString = true;
                        tpl = me.stringTpl;
                        v = Ext.util.Base64._utf8_encode(v);
                        types.push('s');
                    } else if (typeof v === 'boolean') {
                        hasBool = true;
                        tpl = me.booleanTpl;
                        types.push('b');
                    } else if (typeof v === 'number') {
                        hasNumber = true;
                        tpl = me.numberTpl;
                        minValue = Math.min(minValue, v);
                        maxValue = Math.max(maxValue, v);
                        if (String(v).indexOf('.') >= 0) {
                            hasFloat = true;
                        }
                        types.push('n');
                    } else if (v instanceof Date) {
                        hasDate = true;
                        tpl = me.dateTpl;
                        v = Ext.Date.format(v, 'Y-m-d\\TH:i:s.u');
                        types.push('d');
                    }
                    str += Ext.String.format(tpl, v);
                }
            }
        }
        if (count > 0) {
            data.count = count;
        }
        data.stritems = str;
        if (hasDate) {
            data.containsSemiMixedTypes = hasString;
            data.containsDate = true;
            data.stritems = '';
        }
        if (hasNumber) {
            data.containsSemiMixedTypes = hasString;
            data.containsNumber = true;
            data.minValue = minValue;
            data.maxValue = maxValue;
            if (!hasFloat) {
                data.containsInteger = true;
            }
        }
        data.containsString = hasString;
        len = Ext.Array.unique(types);
        if (len > 0) {
            data.containsMixedTypes = len > 1;
        }
        return data;
    },
    applyItems: function(items) {
        return items !== null ? Ext.Array.from(items) : null;
    },
    updateMinValue: function(v) {
        if (v != null) {
            this.setContainsNumber(true);
        }
    },
    updateMaxValue: function(v) {
        if (v != null) {
            this.setContainsNumber(true);
        }
    },
    applyMinDate: function(v) {
        if (v) {
            v = Ext.Date.format(v, 'Y-m-d\\TH:i:s.u');
        }
        return v;
    },
    updateMinDate: function(v) {
        if (v != null) {
            this.setContainsDate(true);
        }
    },
    applyMaxDate: function(v) {
        if (v) {
            v = Ext.Date.format(v, 'Y-m-d\\TH:i:s.u');
        }
        return v;
    },
    updateMaxDate: function(v) {
        if (v != null) {
            this.setContainsDate(true);
        }
    }
});

/**
 * Represent a single field in the PivotCache. This definition contains information about the field,
 * such as its source, data type, and location within a level or hierarchy. The sharedItems element
 * stores additional information about the data in this field. If there are no shared items, then
 * values are stored directly in the pivotCacheRecords part.
 *
 * (CT_CacheField)
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.excel.CacheField', {
    extend: 'Ext.exporter.file.ooxml.Base',
    requires: [
        'Ext.exporter.file.ooxml.excel.SharedItems'
    ],
    config: {
        /**
         * @cfg {String} caption
         *
         * Specifies the caption of the cache field.
         */
        caption: null,
        /**
         * @cfg {Boolean} [databaseField]
         *
         * Specifies a boolean value that indicates whether this field came from the source database
         * rather having been created by the application.
         *
         * A value of 1 or true indicates the field is from the source database.
         *
         * A value of 0 or false indicates the field was created by the application.
         *
         * **Note**: This attribute could be used for a defined grouped or calculated field. In this case,
         * source database fields should precede defined grouped or calculated fields.
         */
        databaseField: null,
        /**
         * @cfg {String} [formula]
         *
         * Specifies the formula for the calculated field. This formula is specified by the end-user.
         * Calculated fields can perform calculations by using the contents of other fields in the PivotTable.
         *
         * In formulas you create for calculated fields or calculated items, you can use operators and
         * expressions as you do in other worksheet formulas. You can use constants and refer to data
         * from the PivotTable, but you cannot use cell references or defined names. You cannot use
         * worksheet functions that require cell references or defined names as arguments, and you cannot
         * use array functions.
         *
         * Further behaviors and restrictions apply to formulas for calculated fields:
         *
         * - Formulas for calculated fields operate on the sum of the underlying data for any fields in
         * the formula. [Example: The formula =Sales * 1.2 multiplies the sum of the sales for each type
         * and region by 1.2; it does not multiply each individual sale by 1.2 and then sum the multiplied
         * amounts. end example]
         * - Formulas cannot refer to totals.
         */
        formula: null,
        /**
         * @cfg {Number} [hierarchy]
         *
         * Specifies the hierarchy that this field is part of.
         */
        hierarchy: null,
        /**
         * @cfg {Number} [level]
         *
         * Specifies the hierarchy level that this field is part of.
         */
        level: null,
        /**
         * @cfg {Number} [mappingCount]
         *
         * Specifies the number of property mappings for this field.
         */
        mappingCount: null,
        /**
         * @cfg {Boolean} [memberPropertyField]
         *
         * Specifies a boolean value that indicates whether the field contains OLAP member property information.
         *
         * A value of 1 or true indicates this field contains OLAP member property information.
         *
         * A value of 0 or false indicates this field does not contain OLAP member property information.
         */
        memberPropertyField: null,
        /**
         * @cfg {String} [name]
         *
         * Specifies the name of the cache field.
         */
        name: null,
        /**
         * @cfg {Number} [numFmtId]
         *
         * Specifies the number format that is applied to all items in the field. Number formats are written
         * to the styles part.
         *
         * **Note**: Formatting information provided by cell table and by PivotTable need not agree. If the
         * two formats differ, the cell-level formatting takes precedence. If you change the layout of the
         * PivotTable, the PivotTable formatting will then take precedence.
         */
        numFmtId: null,
        /**
         * @cfg {String} [propertyName]
         *
         * Specifies the name of the property if this field is an OLAP property field.
         */
        propertyName: null,
        /**
         * @cfg {Boolean} [serverField]
         *
         * Specifies a boolean value that indicates whether the field is a server-based page field.
         *
         * A value of 1 or true indicates this field is a server-based page field.
         *
         * A value of 0 or false indicates this field is not a server-based page field.
         *
         * This attribute applies to ODBC sources only.
         */
        serverField: null,
        /**
         * @cfg {Number} [sqlType]
         *
         * Specifies the SQL data type of the field. This attribute stores an ODBC data type and
         * applies to ODBC data sources only. A value is supplied for this attribute only if it
         * is provided to the application.
         *
         * The following are data types supported by ODBC. For a more information, see the ODBC specification.
         *
         * - `0` SQL_UNKNOWN_TYPE
         * - `1` SQL_CHAR
         * - `2` SQL_VARCHAR
         * - `-1` SQL_LONGVARCHAR
         * - `-8` SQL_WCHAR
         * - `-9` SQL_WVARCHAR
         * - `-10` SQL_WLONGVARCHAR
         * - `3`  SQL_DECIMAL
         * - `2`  SQL_NUMERIC
         * - `5`  SQL_SMALLINT
         * - `4`  S`QL_INTEGER
         * - `7`  SQL_REAL
         * - `6`  SQL_FLOAT
         * - `8`  SQL_DOUBLE
         * - `-7` SQL_BIT
         * - `-6` SQL_TINYINT
         * - `-5` SQL_BIGINT
         * - `-2` SQL_BINARY
         * - `-3` SQL_VARBINARY
         * - `-4` SQL_LONGVARBINARY
         * - `9`` SQL_TYPE_DATE or SQL_DATE
         * - `10` SQL_TYPE_TIME or SQL_TIME
         * - `11` SQL_TYPE_TIMESTAMP or SQL_TIMESTAMP
         * - `102` SQL_INTERVAL_MONTH
         * - `101` SQL_INTERVAL_YEAR
         * - `107` SQL_INTERVAL_YEAR_TO_MONTH
         * - `103` SQL_INTERVAL_DAY
         * - `104` SQL_INTERVAL_HOUR
         * - `105` SQL_INTERVAL_MINUTE
         * - `106` SQL_INTERVAL_SECOND
         * - `108` SQL_INTERVAL_DAY_TO_HOUR
         * - `109` SQL_INTERVAL_DAY_TO_MINUTE
         * - `110` SQL_INTERVAL_DAY_TO_SECOND
         * - `111` SQL_INTERVAL_HOUR_TO_MINUTE
         * - `112` SQL_INTERVAL_HOUR_TO_SECOND
         * - `113` SQL_INTERVAL_MINUTE_TO_SECOND
         * - `-11` SQL_GUID
         * - `-20` SQL_SIGNED_OFFSET`
         * - `-22` SQL_UNSIGNED_OFFSET
         */
        sqlType: null,
        /**
         * @cfg {Boolean} [uniqueList]
         *
         * Specifies a boolean value that indicates whether the application was able to get a list
         * of unique items for the field. The attribute only applies to PivotTables that use ODBC
         * and is intended to be used in conjunction with optimization features in the application.
         * [Example: the application can optimize memory usage when populating PivotCache records
         * if it has a list of unique items for a field before all the records are retrieved from ODBC. end example]
         *
         * A value of 1 or true indicates the application was able to get a list of unique values for the field.
         *
         * A value of 0 or false indicates the application was unable to get a list of unique values for the field.
         */
        uniqueList: null,
        /**
         * @cfg {Ext.exporter.file.ooxml.excel.SharedItems} [sharedItems]
         *
         * Represents the collection of unique items for a field in the PivotCacheDefinition.
         */
        sharedItems: {},
        fieldGroup: null,
        mpMap: null
    },
    tplNonAttributes: [
        'sharedItems',
        'fieldGroup',
        'mpMap'
    ],
    /**
     * @cfg generateTplAttributes
     * @inheritdoc Ext.exporter.file.ooxml.Base#cfg!generateTplAttributes
     * @localdoc
     *
     * **Note** Do not rename the config names that are part of the `attributes` since they are
     * mapped to the xml attributes needed by the template.
     */
    generateTplAttributes: true,
    tpl: [
        '<cacheField {attributes}>',
        '<tpl if="sharedItems">{[values.sharedItems.render()]}</tpl>',
        '</cacheField>'
    ],
    destroy: function() {
        this.setSharedItems(null);
        this.callParent();
    },
    applySharedItems: function(data) {
        if (!data || data.isInstance) {
            return data;
        }
        return new Ext.exporter.file.ooxml.excel.SharedItems(data);
    },
    updateSharedItems: function(data, oldData) {
        Ext.destroy(oldData);
    }
});

/**
 * This element represents a cache of data for pivot tables and formulas in the workbook.
 *
 * (CT_PivotCache)
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.excel.PivotCache', {
    extend: 'Ext.exporter.file.ooxml.Base',
    config: {
        id: null,
        cacheId: null
    },
    autoGenerateId: false,
    tpl: [
        '<pivotCache cacheId="{cacheId}" r:id="{id}"/>'
    ]
});

/**
 * Represents the pivotCacheDefinition part. This part defines each field in the source data,
 * including the name, the string resources of the instance data (for shared items), and information
 * about the type of data that appears in the field.
 *
 * (CT_PivotCacheDefinition)
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.excel.PivotCacheDefinition', {
    extend: 'Ext.exporter.file.ooxml.XmlRels',
    requires: [
        'Ext.exporter.file.ooxml.excel.PivotCacheRecords',
        'Ext.exporter.file.ooxml.excel.CacheSource',
        'Ext.exporter.file.ooxml.excel.CacheField',
        'Ext.exporter.file.ooxml.excel.PivotCache'
    ],
    config: {
        /**
         * @cfg {Boolean} [backgroundQuery]
         *
         * Specifies a boolean value that indicates whether the application should query and retrieve
         * records asynchronously from the cache.
         *
         * A value of 1 or true indicates the application will retrieve records asynchronously from the cache.
         *
         * A value of 0 or false indicates the application will retrieve records synchronously.
         */
        backgroundQuery: null,
        /**
         * @cfg {Number} [createdVersion]
         *
         * Specifies the version of the application that created the cache. This attribute is application-dependent.
         */
        createdVersion: null,
        /**
         * @cfg {Boolean} [enableRefresh]
         *
         * Specifies a boolean value that indicates whether the end-user can refresh the cache. This
         * attribute depends on whether the application exposes a method for allowing end-users control
         * over refreshing the cache via the user interface.
         *
         * A value of 1 or true indicates the end-user can refresh the cache.
         *
         * A value of 0 or false indicates the end-user cannot refresh the cache.
         */
        enableRefresh: null,
        /**
         * @cfg {Boolean} [invalid]
         *
         * Specifies a boolean value that indicates whether the cache needs to be refreshed.
         *
         * A value of 1 or true indicates the cache needs to be refreshed.
         *
         * A value of 0 or false indicates the cache does not need to be refreshed.
         */
        invalid: null,
        /**
         * @cfg {Number} [minRefreshableVersion]
         *
         * Specifies the earliest version of the application that is required to refresh the cache.
         * This attribute is application-dependent.
         */
        minRefreshableVersion: null,
        /**
         * @cfg {Number} [missingItemsLimit]
         *
         * Specifies the number of unused items to allow before discarding unused items.
         * This attribute is application-dependent. The application shall specify a threshold for unused items.
         */
        missingItemsLimit: null,
        /**
         * @cfg {Boolean} [optimizeMemory]
         *
         * Specifies a boolean value that indicates whether the application will apply optimizations to
         * the cache to reduce memory usage. This attribute is application-dependent. This application shall
         * define its own cache optimization methods. The application shall also decide whether to expose
         * cache optimization status via the user interface or an object model.
         *
         * A value of 1 or true indicates the application will apply optimizations to the cache.
         *
         * A value of 0 or false indicates the application will not apply optimizations to the cache.
         */
        optimizeMemory: null,
        /**
         * @cfg {Number} [recordCount]
         *
         * Specifies the number of records in the cache.
         */
        recordCount: null,
        /**
         * @cfg {String} [refreshedBy]
         *
         * Specifies the name of the end-user who last refreshed the cache. This attribute is
         * application-dependent and is specified by applications that track and store the identity
         * of the current user. This attribute also depends on whether the application exposes mechanisms
         * via the user interface whereby the end-user can refresh the cache.
         */
        refreshedBy: null,
        /**
         * @cfg {Date} [refreshedDateIso]
         *
         * Specifies the date when the cache was last refreshed. This attribute depends on whether the
         * application exposes mechanisms via the user interface whereby the end-user can refresh the cache.
         */
        refreshedDateIso: null,
        /**
         * @cfg {Number} [refreshedVersion]
         *
         * Specifies the version of the application that last refreshed the cache. This attribute
         * depends on whether the application exposes mechanisms via the user interface whereby the
         * end-user can refresh the cache.
         */
        refreshedVersion: null,
        /**
         * @cfg {Boolean} [refreshOnLoad]
         *
         * Specifies a boolean value that indicates whether the application will refresh the cache
         * when the workbook has been opened.
         *
         * A value of 1 or true indicates that application will refresh the cache when the workbook is loaded.
         *
         * A value of 0 or false indicates the application will not automatically refresh cached data.
         * The end user shall trigger refresh of the cache manually via the application user interface.
         */
        refreshOnLoad: null,
        /**
         * @cfg {Boolean} [saveData]
         *
         * Specifies a boolean value that indicates whether the pivot records are saved with the cache.
         *
         * A value of 1 or true indicates pivot records are saved in the cache.
         *
         * A value of 0 or false indicates are not saved in the cache.
         */
        saveData: null,
        /**
         * @cfg {Boolean} [supportAdvancedDrill]
         *
         * Specifies whether the cache's data source supports attribute drilldown.
         */
        supportAdvancedDrill: null,
        /**
         * @cfg {Boolean} [supportSubquery]
         *
         * Specifies whether the cache's data source supports subqueries.
         */
        supportSubquery: null,
        /**
         * @cfg {Boolean} [tupleCache]
         *
         * Specifies a boolean value that indicates whether the PivotCache is used store information
         * for OLAP sheet data functions.
         *
         * A value of 1 or true indicates information about OLAP sheet data functions are stored in the cache.
         *
         * A value of 0 or false indicates the PivotCache does not contain information about OLAP sheet data functions.
         */
        tupleCache: null,
        /**
         * @cfg {Boolean} [upgradeOnRefresh]
         *
         * Specifies a boolean value that indicates whether the cache is scheduled for version upgrade.
         * This attribute depends on whether the application exposes mechanisms via the user interface whereby
         * the cache might be upgraded.
         *
         * A value of 1 or true indicates the cache is scheduled for upgrade.
         *
         * A value of 0 or false indicates the cache is not scheduled for upgrade.
         */
        upgradeOnRefresh: null,
        /**
         * @cfg {Ext.exporter.file.ooxml.excel.PivotCacheRecords} cacheRecords
         *
         * Represents the collection of records in the PivotCache. This part stores the underlying
         * source data that the PivotTable aggregates.
         */
        cacheRecords: {},
        /**
         * @cfg {Ext.exporter.file.ooxml.excel.CacheSource} [cacheSource]
         *
         * Represents the description of data source whose data is stored in the pivot cache.
         */
        cacheSource: {},
        /**
         * @cfg {Ext.exporter.file.ooxml.excel.CacheField[]} [cacheFields]
         *
         * Represents the collection of field definitions in the source data.
         */
        cacheFields: null,
        /**
         * @cfg {Ext.exporter.file.ooxml.excel.PivotCache} pivotCache
         *
         * This element enumerates pivot cache definition parts used by pivot tables and formulas in this workbook.
         */
        pivotCache: {}
    },
    folder: '/xl/pivotCache/',
    fileName: 'pivotCacheDefinition',
    contentType: {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.pivotCacheDefinition+xml'
    },
    relationship: {
        schema: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotCacheDefinition'
    },
    tplNonAttributes: [
        'cacheRecords',
        'cacheSource',
        'cacheFields',
        'pivotCache'
    ],
    /**
     * @cfg generateTplAttributes
     * @inheritdoc Ext.exporter.file.ooxml.Base#cfg!generateTplAttributes
     * @localdoc
     *
     * **Note** Do not rename the config names that are part of the `attributes` since they are
     * mapped to the xml attributes needed by the template.
     */
    generateTplAttributes: true,
    tpl: [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<pivotCacheDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ',
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="{[values.relationship.getId()]}" {attributes}>',
        //'{% debugger; %}',
        '{[values.cacheSource.render()]}',
        '<tpl if="cacheFields"><cacheFields count="{cacheFields.length}"><tpl for="cacheFields.getRange()">{[values.render()]}</tpl></cacheFields></tpl>',
        '</pivotCacheDefinition>'
    ],
    destroy: function() {
        this.setCacheRecords(null);
        this.setCacheSource(null);
        this.setPivotCache(null);
        this.callParent();
    },
    getRenderData: function() {
        var data = this.callParent(),
            records = this.getCacheRecords();
        if (records) {
            records = records.getItems();
            data.recordCount = records.length;
        }
        return data;
    },
    collectFiles: function(files) {
        var records = this.getCacheRecords();
        if (records) {
            records.collectFiles(files);
        }
        this.callParent([
            files
        ]);
    },
    collectContentTypes: function(types) {
        var records = this.getCacheRecords();
        if (records) {
            // the PivotCacheRecords needs a record in [Content_Types].xml as well
            records.collectContentTypes(types);
        }
        this.callParent([
            types
        ]);
    },
    updateIndex: function(index, oldIndex) {
        var cache = this.getCacheRecords();
        if (cache) {
            cache.setIndex(index);
        }
        this.callParent([
            index,
            oldIndex
        ]);
    },
    applyPivotCache: function(data) {
        if (!data || data.isInstance) {
            return data;
        }
        return new Ext.exporter.file.ooxml.excel.PivotCache(data);
    },
    updatePivotCache: function(data, oldData) {
        Ext.destroy(oldData);
    },
    applyCacheRecords: function(data) {
        if (!data || data.isInstance) {
            return data;
        }
        return new Ext.exporter.file.ooxml.excel.PivotCacheRecords(data);
    },
    updateCacheRecords: function(data, oldData) {
        var rels = this.getRelationships(),
            rel;
        if (oldData) {
            rels.removeRelationship(oldData.getRelationship());
        }
        Ext.destroy(oldData);
        if (data) {
            rel = data.getRelationship();
            rels.addRelationship(rel);
            this.setId(rel.getId());
        }
    },
    applyCacheSource: function(data) {
        if (!data || data.isInstance) {
            return data;
        }
        return new Ext.exporter.file.ooxml.excel.CacheSource(data);
    },
    updateCacheSource: function(data, oldData) {
        Ext.destroy(oldData);
    },
    applyCacheFields: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.file.ooxml.excel.CacheField');
    }
});

/**
 * Represent information on style applied to the PivotTable.
 *
 * (CT_PivotTableStyleInfo)
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.excel.PivotTableStyleInfo', {
    extend: 'Ext.exporter.file.ooxml.Base',
    config: {
        /**
         * @cfg {String} name
         *
         * Specifies the name of the table style to use with this table.
         *
         * The following style names are predefined:
         * - `PivotStyleLight1` -> `PivotStyleLight28`
         * - `PivotStyleMedium1` -> `PivotStyleMedium28`
         * - `PivotStyleDark1` -> `PivotStyleDark28`
         *
         * Annex G of the file c061750_ISO_IEC_29500-1_2012.pdf contains a listing of the supported PivotTable
         * styles and a sample workbook with each of those styles applied.*
         */
        name: 'PivotStyleLight2',
        /**
         * @cfg {Boolean} [showColHeaders]
         *
         * Specifies a boolean value that indicates whether to show column headers for the table.
         *
         * A value of 1 or true indicates column headers are shown.
         *
         * A value of 0 or false indicates column headers are omitted.
         *
         * 'True' if table style column header formatting should be displayed.
         */
        showColHeaders: true,
        /**
         * @cfg {Boolean} [showColStripes]
         *
         * Specifies a boolean value that indicates whether to show column stripe formatting for the table.
         *
         * A value of 1 or true indicates column stripe formatting is shown.
         *
         * A value of 0 or false indicates no column formatting is shown.
         *
         * True if table style column stripe formatting should be displayed.
         */
        showColStripes: null,
        /**
         * @cfg {Boolean} [showLastColumn]
         *
         * Specifies a boolean value that indicates whether to show the last column.
         */
        showLastColumn: true,
        /**
         * @cfg {Boolean} [showRowHeaders]
         *
         * Specifies a boolean value that indicates whether to show row headers for the table.
         *
         * A value of 1 or true indicates table style formatting is displayed.
         *
         * A value of 0 or false indicates table style formatting will not be displayed.
         */
        showRowHeaders: true,
        /**
         * @cfg {Boolean} [showRowStripes]
         *
         * Specifies a boolean value that indicates whether to show row stripe formatting for the table.
         *
         * A value of 1 or true indicates row stripe formatting is displayed.
         *
         * A value of 0 or false indicates no row formatting is shown.
         */
        showRowStripes: null
    },
    /**
     * @cfg generateTplAttributes
     * @inheritdoc Ext.exporter.file.ooxml.Base#cfg!generateTplAttributes
     * @localdoc
     *
     * **Note** Do not rename the config names that are part of the `attributes` since they are
     * mapped to the xml attributes needed by the template.
     */
    generateTplAttributes: true,
    tpl: [
        '<pivotTableStyleInfo {attributes}/>'
    ]
});

/**
 * Represents the PivotTable root element for non-null PivotTables. There exists one pivotTableDefinition
 * for each PivotTableDefinition part.
 *
 * (CT_PivotTableDefinition)
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.excel.PivotTable', {
    extend: 'Ext.exporter.file.ooxml.XmlRels',
    requires: [
        'Ext.exporter.file.ooxml.excel.Location',
        'Ext.exporter.file.ooxml.excel.PivotField',
        'Ext.exporter.file.ooxml.excel.Field',
        'Ext.exporter.file.ooxml.excel.Item',
        'Ext.exporter.file.ooxml.excel.DataField',
        'Ext.exporter.file.ooxml.excel.PivotCacheDefinition',
        'Ext.exporter.file.ooxml.excel.PivotTableStyleInfo'
    ],
    config: {
        /**
         * @cfg {Boolean} [applyAlignmentFormats]
         *
         * If true apply legacy table autoformat alignment properties.
         */
        applyAlignmentFormats: false,
        /**
         * @cfg {Boolean} [applyBorderFormats]
         *
         * If true apply legacy table autoformat border properties.
         */
        applyBorderFormats: false,
        /**
         * @cfg {Boolean} [applyFontFormats]
         *
         * If true apply legacy table autoformat font properties.
         */
        applyFontFormats: false,
        /**
         * @cfg {Boolean} [applyNumberFormats]
         *
         * If true apply legacy table autoformat number format properties.
         */
        applyNumberFormats: false,
        /**
         * @cfg {Boolean} [applyPatternFormats]
         *
         * If true apply legacy table autoformat pattern properties.
         */
        applyPatternFormats: false,
        /**
         * @cfg {Boolean} [applyWidthHeightFormats]
         *
         * If true apply legacy table autoformat width/height properties.
         */
        applyWidthHeightFormats: true,
        /**
         * @cfg {Boolean} [asteriskTotals]
         *
         * Specifies a boolean value that indicates whether an asterisks should be displayed in subtotals and
         * totals when visual totals are not used in OLAP -based PivotTables.
         *
         * A value of 1 or true indicates an asterisks are displayed in subtotals and totals for OLAP
         * PivotTables when visual tools are not available.
         *
         * A value of 0 or false indicates an asterisk will not be displayed. This attribute depends on the
         * implementation and availability of visual tools in the application user interface.
         */
        asteriskTotals: null,
        /**
         * @cfg {Number} [autoFormatId]
         *
         * Identifies which legacy table autoformat to apply.
         *
         * Use a value >= 4096 and <= 4117.
         *
         * Annex G of the file c061750_ISO_IEC_29500-1_2012.pdf contains a listing of the supported PivotTable
         * AutoFormats, example formatting, and a sample workbook with each of those AutoFormats applied.
         */
        autoFormatId: 4096,
        /**
         * @cfg {Number} cacheId (required)
         *
         * Specifies the identifier of the related PivotCache definition. This Id is listed in the pivotCaches
         * collection in the workbook part.
         */
        cacheId: null,
        /**
         * @cfg {Number} [chartFormat]
         *
         * Specifies the next chart formatting identifier to use on the PivotTable.
         */
        chartFormat: null,
        /**
         * @cfg {Boolean} [colGrandTotals]
         *
         * Specifies a boolean value that indicates whether grand totals should be displayed for the PivotTable columns.
         *
         * A value of 1 or true indicates grand totals should be displayed.
         *
         * A value of 0 or false indicates grand totals should not be displayed for PivotTable columns.
         */
        colGrandTotals: null,
        /**
         * @cfg {String} [colHeaderCaption]
         *
         * Specifies the string to be displayed in column header in compact mode. This attribute depends on whether
         * the application implements a compact mode for displaying PivotTables in the user interface.
         */
        colHeaderCaption: null,
        /**
         * @cfg {Boolean} [compact]
         *
         * Specifies a boolean value that indicates whether new fields should have their compact flag set to true.
         *
         * A value of 1 or true indicates new fields should default to compact mode equal to true.
         *
         * A value of 0 or false indicates new fields should default to compact mode equal to false. This attribute
         * depends on whether the application implements a compact mode in the user interface.
         */
        compact: false,
        /**
         * @cfg {Boolean} [compactData]
         *
         * Specifies a boolean value that indicates whether the field next to the data field in the
         * PivotTable should be displayed in the same column of the spreadsheet
         */
        compactData: false,
        /**
         * @cfg {Number} [createdVersion]
         *
         * Specifies the version of the application that created the cache. This attribute is application-dependent.
         */
        createdVersion: null,
        /**
         * @cfg {Boolean} [customListSort]
         *
         * Specifies a boolean value that indicates whether the "custom lists" option is offered when sorting
         * this PivotTable.
         *
         * A value of 1 or true indicates custom lists are offered when sorting this PivotTable.
         *
         * A value of 0 or false indicates custom lists are not offered. This attribute depends on the
         * implementation of sorting features in the application.
         */
        customListSort: null,
        /**
         * @cfg {String} dataCaption (required)
         *
         * Specifies the name of the value area field header in the PivotTable. This caption is shown in
         * the PivotTable when two or more fields are in the values area.
         */
        dataCaption: 'Values',
        /**
         * @cfg {Boolean} [dataOnRows]
         *
         * Specifies a boolean value that indicates whether the field representing multiple fields in the data
         * region is located in the row area or the column area.
         *
         * A value of 1 or true indicates that this field is located in the row area.
         *
         * A value of 0 or false indicates that this field is located in the column area.
         */
        dataOnRows: null,
        /**
         * @cfg {Number} [dataPosition]
         *
         * Specifies the position for the field representing multiple data field in the PivotTable, whether
         * that field is located in the row area or column area.
         *
         * Missing attribute indicates this field is last, or innermost in the field list.
         *
         *  - 0 indicates this field is first, or outermost in the field list.
         *  - 1 indicates this field is second in the field list.
         *  - 2 indicates this field is third in the field list, and increasing values follow this pattern.
         *
         *  If this value is higher than the number of fields in the field list, then this field is last, or
         *  innermost in the field list.
         */
        dataPosition: null,
        /**
         * @cfg {Boolean} [disableFieldList]
         *
         * Specifies a boolean value that indicates whether to disable the PivotTable field list.
         *
         * A value of 1 or true indicates the field list, or similar mechanism for selecting fields in the
         * user interface, is disabled.
         *
         * A value of 0 or false indicates the field list is enabled.
         */
        disableFieldList: null,
        /**
         * @cfg {Boolean} [editData]
         *
         * Specifies a boolean value that indicates whether the user is allowed to edit the cells in the data
         * area of the PivotTable.
         *
         * A value of 1 or true indicates the user can edit values in the data area.
         *
         * A value of 0 or false indicates the cells in the data area are not editable.
         */
        editData: null,
        /**
         * @cfg {Boolean} [enableDrill]
         *
         * Specifies a boolean value that indicates whether the user is prevented from drilling down on a
         * PivotItem or aggregate value.
         *
         * A value of 1 or true indicates the user can drill down on a pivot item or aggregate value.
         *
         * A value of 0 or false indicates the user is prevented from drilling down pivot item.
         */
        enableDrill: null,
        /**
         * @cfg {Boolean} [enableFieldProperties]
         *
         * Specifies a boolean value that indicates whether the user is prevented from displaying PivotField
         * properties.
         *
         * A value of 1 or true indicates the user can display pivot field properties.
         *
         * A value of 0 or false indicates the user cannot display pivot field properties. This attribute
         * depends on how pivot field properties are exposed in the application user interface.
         */
        enableFieldProperties: null,
        /**
         * @cfg {Boolean} [enableWizard]
         *
         * Specifies a boolean value that indicates whether the user is prevented from displaying the
         * PivotTable wizard.
         *
         * A value of 1 or true indicates the user can display the PivotTable wizard.
         *
         * A value of 0 or false indicates the user can not display the PivotTable wizard. This attribute
         * depends on whether the application exposes a wizard or similar mechanism for creating and working
         * with PivotTables in the user interface.
         */
        enableWizard: null,
        /**
         * @cfg {String} [errorCaption]
         *
         * Specifies the string to be displayed in cells that contain errors.
         */
        errorCaption: null,
        /**
         * @cfg {Boolean} [fieldListSortAscending]
         *
         * Specifies a boolean value that indicates whether fields in the PivotTable are sorted in non-default
         * order in the field list.
         *
         * A value of 1 or true indicates fields for the PivotTable are sorted in the field list. The sort
         * order from the data source is applied for range-based PivotTables. Alphabetical sorting is applied
         * for external data PivotTables.
         *
         * A value of 0 or false indicates fields in the field list are not sorted.
         */
        fieldListSortAscending: null,
        /**
         * @cfg {Boolean} [fieldPrintTitles]
         *
         * Specifies a boolean value that indicates whether the row and column titles from the PivotTable
         * should be printed.
         *
         * A value of 1 or true indicates row and column titles should be printed.
         *
         * A value of 0 or false indicates row and column titles should not be printed.
         */
        fieldPrintTitles: null,
        /**
         * @cfg {String} [grandTotalCaption]
         *
         * Specifies the string to be displayed for grand totals.
         */
        grandTotalCaption: null,
        /**
         * @cfg {Boolean} [gridDropZones]
         *
         * Specifies a boolean value that indicates whether the in-grid drop zones should be displayed at
         * runtime, and whether classic layout is applied.
         *
         * A value of 1 or true indicates in-grid drop zones should be displayed and classic layout should be
         * applied to the PivotTable.
         *
         * A value of 0 or false indicates in-grid drop zones should be disabled and classic layout should not
         * be applied.
         *
         * **Note**: Grid drop zones are optional runtime UI, determined by the application, that indicate to
         * the user the locations of the page, row, column, and data fields in the PivotTable report. See layout
         * discussion under pivotTableDefinition for the precise locations of these areas.
         */
        gridDropZones: null,
        /**
         * @cfg {Boolean} [immersive]
         *
         * Specifies a boolean value that indicates whether PivotTable immersive experience user interface
         * should be turned off.
         *
         * A value of 1 or true indicates the PivotTable immersive experience should be turned off for this
         * PivotTable.
         *
         * A value of 0 or false indicates the immersive experience should be left on. This attribute
         * depends on whether the application implements an immersive experience in the user interface.
         */
        immersive: null,
        /**
         * @cfg {Number} [indent]
         *
         * Specifies the indentation increment for compact axis and can be used to set the Report Layout
         * to Compact Form.
         */
        indent: null,
        /**
         * @cfg {Boolean} [itemPrintTitles]
         *
         * Specifies a boolean value that indicates whether PivotItem names should be repeated at the top of
         * each printed page.
         *
         * A value of 1 or true indicates pivot items names should be repeated at the top of each page.
         *
         * A value of 0 or false indicates should not be repeated.
         */
        itemPrintTitles: true,
        /**
         * @cfg {Boolean} [mdxSubqueries]
         *
         * Specifies a boolean value that indicates whether MDX sub-queries are supported by OLAP data provider
         * for this PivotTable.
         *
         * A value of 1 or true indicates MDX sub-queries are supported by the OLAP data provider.
         *
         * A value of 0 or false indicates MDX sub-queries are not supported.
         */
        mdxSubqueries: null,
        /**
         * @cfg {Boolean} [mergeItem]
         *
         * Specifies a boolean value that indicates whether row or column titles that span multiple cells
         * should be merged into a single cell.
         *
         * A value of 1 or true indicates that titles that span multiple cells are merged into a single cell.
         *
         * A value of 0 or false indicates titles are not merged.
         */
        mergeItem: null,
        /**
         * @cfg {Number} [minRefreshableVersion]
         *
         * Specifies the minimum version of the application required to update this PivotTable view.
         * This attribute is application-dependent.
         */
        minRefreshableVersion: null,
        /**
         * @cfg {String} [missingCaption]
         *
         * Specifies the string to be displayed in cells with no value
         */
        missingCaption: null,
        /**
         * @cfg {Boolean} [multipleFieldFilters]
         *
         * Specifies a boolean value that indicates whether the fields of a PivotTable can have
         * multiple filters set on them.
         *
         * A value of 1 or true indicates the fields of a PivotTable can have multiple filters.
         *
         * A value of 0 or false indicates the fields of a PivotTable can only have a simple filter.
         */
        multipleFieldFilters: false,
        /**
         * @cfg {String} name (required)
         *
         * Specifies the PivotTable name.
         */
        name: null,
        /**
         * @cfg {Boolean} [outline]
         *
         * Specifies a boolean value that indicates whether new fields should have their outline flag set to true.
         *
         * A value of 1 or true indicates new fields are created with outline equal to true.
         *
         * A value of 0 or false indicates new fields are created with outline equal to false.
         */
        outline: true,
        /**
         * @cfg {Boolean} [outlineData]
         *
         * Specifies a boolean value that indicates whether data fields in the PivotTable should be
         * displayed in outline form.
         *
         * A value of 1 or true indicates data fields will display in outline form.
         *
         * A value of 0 or false indicates data fields will not display in outline form.
         */
        outlineData: null,
        /**
         * @cfg {Boolean} [pageOverThenDown]
         *
         * Specifies a boolean value that indicates how the page fields are laid out when there are multiple
         * PivotFields in the page area.
         *
         * A value of 1 or true indicates the fields will display "Over, then down"
         *
         * A value of 0 or false indicates the fields will display "down, then Over"
         */
        pageOverThenDown: null,
        /**
         * @cfg {String} [pageStyle]
         *
         * Specifies the name of the style to apply to each of the field item headers in the page
         * area of the PivotTable.
         */
        pageStyle: null,
        /**
         * @cfg {Number} [pageWrap]
         *
         * Specifies the number of page fields to display before starting another row or column.
         */
        pageWrap: null,
        /**
         * @cfg {String} [pivotTableStyle]
         *
         * Specifies the name of the style to apply to the main table area of the PivotTable.
         */
        pivotTableStyle: null,
        /**
         * @cfg {Boolean} [preserveFormatting]
         *
         * Specifies a boolean value that indicates whether the formatting applied by the user to the
         * PivotTable cells is discarded on refresh.
         *
         * A value of 1 or true indicates the formatting applied by the end user is discarded on refresh.
         *
         * A value of 0 or false indicates the end-user formatting is retained on refresh.
         */
        preserveFormatting: null,
        /**
         * @cfg {Boolean} [printDrill]
         *
         * Specifies a boolean value that indicates whether drill indicators expand collapse buttons should be printed.
         *
         * A value of 1 or true indicates that these buttons should be printed.
         *
         * A value of 0 or false indicates that these buttons should not be printed.
         */
        printDrill: null,
        /**
         * @cfg {Boolean} [published]
         *
         * Specifies a boolean value that indicates whether data fields in the PivotTable are published and
         * available for viewing in a server rendering environment.
         *
         * A value of 1 or true indicates that the data fields in the PivotTable are published and shall be
         * available for viewing in a server rendering environment.
         *
         * A value of 0 or false indicates that the data fields in the PivotTable are not published and shall
         * not be available for viewing in a server rendering environment.
         */
        published: null,
        /**
         * @cfg {Boolean} [rowGrandTotals]
         *
         * Specifies a boolean value that indicates whether grand totals should be displayed for the
         * PivotTable rows. The default value for this attribute is true.
         *
         * A value of 1 or true indicates grand totals are displayed for the PivotTable rows.
         *
         * A value of 0 or false indicates grand totals will not be displayed.
         */
        rowGrandTotals: null,
        /**
         * @cfg {String} [rowHeaderCaption]
         *
         * Specifies the string to be displayed in row header in compact mode.
         */
        rowHeaderCaption: null,
        /**
         * @cfg {Boolean} [showCalcMbrs]
         *
         * Specifies a boolean value that indicates whether calculated members should be shown in the
         * PivotTable view. This attribute applies to PivotTables from OLAP-sources only.
         *
         * A value of 1 or true indicates that calculated members should be shown.
         *
         * A value of 0 or false indicates calculated members should not be shown.
         */
        showCalcMbrs: null,
        /**
         * @cfg {Boolean} [showDataDropDown]
         *
         * Specifies a boolean value that indicates whether the drop-down lists for the fields in the
         * PivotTable should be hidden. This attribute depends on whether the application implements drop down
         * lists or similar mechanism in the user interface.
         *
         * A value of 1 or true indicates drop down lists are displayed for fields.
         *
         * A value of 0 or false indicates drop down lists will not be displayed.
         */
        showDataDropDown: null,
        /**
         * @cfg {Boolean} [showDataTips]
         *
         * Specifies a boolean value that indicates whether tooltips should be displayed for PivotTable data cells.
         *
         * A value of 1 or true indicates tooltips are displayed.
         *
         * A value of 0 or false indicates tooltips will not be displayed. This attribute depends on
         * whether the application employs tooltips or similar mechanism in the user interface.
         */
        showDataTips: null,
        /**
         * @cfg {Boolean} [showDrill]
         *
         * Specifies a boolean value that indicates whether drill indicators should be hidden.
         *
         * A value of 1 or true indicates drill indicators are displayed.
         *
         * A value of 0 or false indicates drill indicators will not be displayed.
         */
        showDrill: null,
        /**
         * @cfg {Boolean} [showDropZones]
         *
         * Specifies a boolean value that indicates whether the PivotTable should display large drop zones
         * when there are no fields in the data region.
         *
         * A value of 1 or true indicates a large drop zone is displayed.
         *
         * A value of 0 or false indicates a large drop zone will not be displayed.
         */
        showDropZones: null,
        /**
         * @cfg {Boolean} [showEmptyCol]
         *
         * Specifies a boolean value that indicates whether to include empty columns in the table.
         *
         * A value of 1 or true indicates empty columns are included in the PivotTable.
         *
         * A value of 0 or false indicates empty columns are excluded.
         */
        showEmptyCol: null,
        /**
         * @cfg {Boolean} [showEmptyRow]
         *
         * Specifies a boolean value that indicates whether to include empty rows in the table.
         *
         * A value of 1 or true indicates empty rows are included in the PivotTable.
         *
         * A value of 0 or false indicates empty rows are excluded.
         */
        showEmptyRow: null,
        /**
         * @cfg {Boolean} [showError]
         *
         * Specifies a boolean value that indicates whether to show error messages in cells.
         *
         * A value of 1 or true indicates error messages are shown in cells.
         *
         * A value of 0 or false indicates error messages are shown through another mechanism the
         * application provides in the user interface.
         */
        showError: null,
        /**
         * @cfg {Boolean} [showHeaders]
         *
         * Specifies a boolean value that indicates whether to suppress display of pivot field headers.
         *
         * A value of 1 or true indicates field headers are shown in the PivotTable.
         *
         * A value of 0 or false indicates field headers are excluded.
         */
        showHeaders: null,
        /**
         * @cfg {Boolean} [showItems]
         *
         * Specifies a boolean value that indicates whether to display item names when adding a field onto
         * a PivotTable that has no data fields.
         *
         * A value of 1 or true indicates item names are displayed.
         *
         * A value of 0 or false indicates item names will not be displayed.
         */
        showItems: null,
        /**
         * @cfg {Boolean} [showMemberPropertyTips]
         *
         * Specifies a boolean value that indicates whether member property information should be omitted
         * from PivotTable tooltips.
         *
         * A value of 1 or true indicates member property information is included.
         *
         * A value of 0 or false indicates member property information is excluded. This attribute depends on
         * whether the application employs tooltips or similar mechanism in the user interface.
         */
        showMemberPropertyTips: null,
        /**
         * @cfg {Boolean} [showMissing]
         *
         * Specifies a boolean value that indicates whether to show a message in cells with no value.
         *
         * A value of 1 or true indicates to show a message string in cells without values.
         *
         * A value of 0 or false indicates no message string will shown in cells without values.
         */
        showMissing: null,
        /**
         * @cfg {Boolean} [showMultipleLabel]
         *
         * Specifies a boolean value that indicates whether a page field with multiple selected items should
         * display "(multiple items)" instead of "All". This attribute applies only to non-OLAP PivotTables.
         * The messages displayed depend on the application implementation.
         *
         * A value of 1 or true indicates a different message string is displayed for a page field with
         * multiple items.
         *
         * A value of 0 or false indicates the same message string is displayed for all page fields.
         */
        showMultipleLabel: null,
        /**
         * @cfg {Boolean} [subtotalHiddenItems]
         *
         * Specifies a boolean value that indicates whether data for hidden pivotItems for PivotFields in the
         * data area should be included in subtotals.
         *
         * A value of 1 or true indicates that data for hidden pivot items in the data area is included in
         * subtotals.
         *
         * A value of 0 or false indicates hidden pivot items will not be included in subtotals.
         */
        subtotalHiddenItems: null,
        /**
         * @cfg {String} [tag]
         *
         * Specifies a user-defined string that is associated with this PivotTable.
         */
        tag: null,
        /**
         * @cfg {Number} [updatedVersion]
         *
         * Specifies the version of the application that last updated the PivotTable view. This attribute is
         * application-dependent.
         */
        updatedVersion: null,
        /**
         * @cfg {Boolean} [useAutoFormatting]
         *
         * Specifies a boolean value that indicates whether legacy auto formatting has been applied
         * to the PivotTable view.
         *
         * A value of 1 or true indicates that legacy auto formatting has been applied to the PivotTable.
         *
         * A value of 0 or false indicates that legacy auto formatting has not been applied to the PivotTable.
         */
        useAutoFormatting: true,
        /**
         * @cfg {String} [vacatedStyle]
         *
         * Specifies the name of the style to apply to the cells left blank when a PivotTable shrinks
         * during a refresh operation
         */
        vacatedStyle: null,
        /**
         * @cfg {Boolean} [visualTotals]
         *
         * Specifies a boolean value that indicates whether totals should be based on visible data only.
         * This attribute applies to OLAP PivotTables only.
         *
         * A value of 1 or true indicates subtotals are computed on visible data only.
         *
         * A value of 0 or false indicates subtotals are computed on all data.
         */
        visualTotals: null,
        /**
         * @cfg {Ext.exporter.file.ooxml.excel.Location} location
         *
         * Represents location information for the PivotTable.
         */
        location: {},
        /**
         * @cfg {Ext.exporter.file.ooxml.excel.PivotField[]} [pivotFields]
         *
         * Represents the collection of fields that appear on the PivotTable.
         */
        pivotFields: null,
        /**
         * @cfg {Ext.exporter.file.ooxml.excel.Field[]} [rowFields]
         *
         * Represents the collection of row fields for the PivotTable.
         */
        rowFields: null,
        /**
         * @cfg {Ext.exporter.file.ooxml.excel.Item[]} [rowItems]
         *
         * Represents the collection of items in row axis of the PivotTable.
         */
        rowItems: null,
        /**
         * @cfg {Ext.exporter.file.ooxml.excel.Field[]} [colFields]
         *
         * Represents the collection of fields that are on the column axis of the PivotTable.
         */
        colFields: null,
        /**
         * @cfg {Ext.exporter.file.ooxml.excel.Item[]} [colItems]
         *
         * Represents the collection of column items of the PivotTable.
         */
        colItems: null,
        /**
         * @cfg {Ext.exporter.file.ooxml.excel.PageField[]} [pageFields]
         *
         * Represents the collection of items in the page or report filter region of the PivotTable.
         */
        pageFields: null,
        /**
         * @cfg {Ext.exporter.file.ooxml.excel.DataField[]} [dataFields]
         *
         * Represents the collection of items in the data region of the PivotTable.
         */
        dataFields: null,
        /**
         * @cfg {Ext.exporter.file.ooxml.excel.PivotTableStyleInfo} pivotTableStyleInfo
         *
         * Represent information on style applied to the PivotTable.
         */
        pivotTableStyleInfo: {},
        /**
         * @cfg {Ext.exporter.file.ooxml.excel.Worksheet} worksheet
         *
         * Reference to the parent worksheet.
         */
        worksheet: null,
        /**
         * @cfg {Ext.exporter.file.ooxml.excel.PivotCacheDefinition} cacheDefinition
         *
         * Represents the pivotCacheDefinition part.
         */
        cacheDefinition: {},
        /**
         * @cfg {String} viewLayoutType
         *
         * Possible values:
         * - compact
         * - outline
         * - tabular
         *
         * Use this config to set the pivot table layout
         */
        viewLayoutType: 'outline'
    },
    //formats: null,
    //conditionalFormats: null,
    //chartFormats: null,
    //pivotHierarchies: null,
    //filters: null,
    //rowHierarchiesUsage: null,
    //colHierarchiesUsage: null,
    folder: '/xl/pivotTables/',
    fileName: 'pivotTable',
    contentType: {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.pivotTable+xml'
    },
    relationship: {
        schema: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/pivotTable'
    },
    tplNonAttributes: [
        'location',
        'worksheet',
        'cacheDefinition',
        'pivotFields',
        'rowFields',
        'rowItems',
        'colFields',
        'colItems',
        'pageFields',
        'dataFields',
        'pivotTableStyleInfo',
        'viewLayoutType'
    ],
    //'formats', 'conditionalFormats', 'chartFormats', 'pivotHierarchies',
    //'filters', 'rowHierarchiesUsage', 'colHierarchiesUsage'
    /**
     * @cfg generateTplAttributes
     * @inheritdoc Ext.exporter.file.ooxml.Base#cfg!generateTplAttributes
     * @localdoc
     *
     * **Note** Do not rename the config names that are part of the `attributes` since they are
     * mapped to the xml attributes needed by the template.
     */
    generateTplAttributes: true,
    tpl: [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<pivotTableDefinition xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" {attributes}>',
        //'{% debugger; %}',
        '{[values.location.render()]}',
        '<tpl if="pivotFields && pivotFields.length"><pivotFields count="{pivotFields.length}"><tpl for="pivotFields.getRange()">{[values.render()]}</tpl></pivotFields></tpl>',
        '<tpl if="rowFields && rowFields.length"><rowFields count="{rowFields.length}"><tpl for="rowFields.getRange()">{[values.render()]}</tpl></rowFields></tpl>',
        '<tpl if="rowItems && rowItems.length"><rowItems count="{rowItems.length}"><tpl for="rowItems.getRange()">{[values.render()]}</tpl></rowItems></tpl>',
        '<tpl if="colFields && colFields.length"><colFields count="{colFields.length}"><tpl for="colFields.getRange()">{[values.render()]}</tpl></colFields></tpl>',
        '<tpl if="colItems && colItems.length"><colItems count="{colItems.length}"><tpl for="colItems.getRange()">{[values.render()]}</tpl></colItems></tpl>',
        '<tpl if="pageFields && pageFields.length"><pageFields count="{pageFields.length}"><tpl for="pageFields.getRange()">{[values.render()]}</tpl></pageFields></tpl>',
        '<tpl if="dataFields && dataFields.length"><dataFields count="{dataFields.length}"><tpl for="dataFields.getRange()">{[values.render()]}</tpl></dataFields></tpl>',
        '<tpl if="pivotTableStyleInfo">{[values.pivotTableStyleInfo.render()]}</tpl>',
        '</pivotTableDefinition>'
    ],
    destroy: function() {
        var me = this;
        me.setWorksheet(null);
        me.setLocation(null);
        me.setCacheDefinition(null);
        me.setPivotTableStyleInfo(null);
        me.callParent();
    },
    collectFiles: function(files) {
        this.getCacheDefinition().collectFiles(files);
        this.callParent([
            files
        ]);
    },
    collectContentTypes: function(types) {
        // the PivotCacheDefinition needs a record in [Content_Types].xml as well
        this.getCacheDefinition().collectContentTypes(types);
        this.callParent([
            types
        ]);
    },
    updateIndex: function(index, oldIndex) {
        var cache = this.getCacheDefinition();
        if (cache) {
            cache.setIndex(index);
        }
        this.generateName();
        this.callParent([
            index,
            oldIndex
        ]);
    },
    updateWorksheet: function(data, oldData) {
        var def = this.getCacheDefinition(),
            wb, pc;
        // the PivotCacheDefinition needs a record in workbook.xml.rels as well
        if (oldData && def && oldData.getWorkbook() && oldData.getWorkbook().getRelationships()) {
            oldData.getWorkbook().getRelationships().removeRelationship(def.getRelationship());
        }
        if (data && def) {
            wb = data.getWorkbook();
            wb.getRelationships().addRelationship(def.getRelationship());
            pc = def.getPivotCache();
            wb.addPivotCache(pc);
            this.setCacheId(pc.getCacheId());
            pc.setId(def.getRelationship().getId());
        }
    },
    applyPivotTableStyleInfo: function(data) {
        if (!data || data.isInstance) {
            return data;
        }
        return new Ext.exporter.file.ooxml.excel.PivotTableStyleInfo(data);
    },
    updatePivotTableStyleInfo: function(data, oldData) {
        Ext.destroy(oldData);
    },
    applyCacheDefinition: function(data) {
        if (!data || data.isInstance) {
            return data;
        }
        return new Ext.exporter.file.ooxml.excel.PivotCacheDefinition(data);
    },
    updateCacheDefinition: function(data, oldData) {
        var rels = this.getRelationships();
        if (oldData) {
            rels.removeRelationship(oldData.getRelationship());
        }
        Ext.destroy(oldData);
        if (data) {
            rels.addRelationship(data.getRelationship());
        }
    },
    updateViewLayoutType: function(value) {
        var me = this;
        if (value === 'compact') {
            me.setOutline(true);
            me.setOutlineData(true);
            me.setCompact(null);
            me.setCompactData(null);
        } else if (value === 'outline') {
            me.setOutline(true);
            me.setOutlineData(true);
            me.setCompact(false);
            me.setCompactData(false);
        } else {
            me.setOutline(null);
            me.setOutlineData(null);
            me.setCompact(false);
            me.setCompactData(false);
        }
        me.processPivotFields(me.getPivotFields().getRange());
    },
    applyLocation: function(data) {
        if (!data || data.isInstance) {
            return data;
        }
        return new Ext.exporter.file.ooxml.excel.Location(data);
    },
    updateLocation: function(data, oldData) {
        Ext.destroy(oldData);
    },
    applyPivotFields: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.file.ooxml.excel.PivotField');
    },
    updatePivotFields: function(collection, oldCollection) {
        var me = this;
        if (oldCollection) {
            oldCollection.un({
                add: me.onPivotFieldAdd,
                scope: me
            });
        }
        if (collection) {
            collection.on({
                add: me.onPivotFieldAdd,
                scope: me
            });
            this.processPivotFields(collection.getRange());
        }
    },
    onPivotFieldAdd: function(collection, details) {
        this.processPivotFields(details.items);
    },
    processPivotFields: function(items) {
        var layout = this.getViewLayoutType(),
            length = items.length,
            i, item, compact, outline;
        if (layout === 'compact') {
            compact = null;
            outline = null;
        } else if (layout === 'outline') {
            compact = false;
            outline = null;
        } else {
            compact = false;
            outline = false;
        }
        for (i = 0; i < length; i++) {
            item = items[i];
            item.setCompact(compact);
            item.setOutline(outline);
        }
    },
    applyRowFields: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.file.ooxml.excel.Field');
    },
    applyRowItems: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.file.ooxml.excel.Item');
    },
    applyColFields: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.file.ooxml.excel.Field');
    },
    applyColItems: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.file.ooxml.excel.Item');
    },
    applyDataFields: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.file.ooxml.excel.DataField');
    },
    applyAutoFormatId: function(value) {
        return (value >= 4096 && value <= 4117) ? value : null;
    }
});

/**
 * This is the root element of Worksheet parts within a SpreadsheetML document.
 *
 * (CT_Worksheet)
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.excel.Worksheet', {
    extend: 'Ext.exporter.file.ooxml.excel.Sheet',
    requires: [
        'Ext.exporter.file.ooxml.excel.Column',
        'Ext.exporter.file.ooxml.excel.Row',
        'Ext.exporter.file.ooxml.excel.PivotTable'
    ],
    isWorksheet: true,
    config: {
        /**
         * @cfg {Ext.exporter.file.ooxml.excel.Column[]} [columns]
         *
         * Column definitions
         */
        columns: null,
        /**
         * @cfg {Ext.exporter.file.ooxml.excel.Row[]} rows (required)
         *
         * Rows in this worksheet
         */
        rows: [],
        drawings: null,
        tables: null,
        mergeCells: null,
        mergedCellsNo: 0,
        /**
         * The reference of the top-left cell in this worksheet
         * @readOnly
         */
        topLeftRef: null,
        /**
         * The reference of the bottom-right cell in this worksheet
         * @readOnly
         */
        bottomRightRef: null,
        cachedRows: '',
        cachedMergeCells: '',
        pivotTables: null
    },
    //comments: null,
    //tableSingleCell: null
    folder: '/xl/worksheets/',
    contentType: {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml'
    },
    relationship: {
        schema: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet'
    },
    tpl: [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ',
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
        '<tpl if="columns">',
        '<cols>',
        '<tpl for="columns.items">{[values.render()]}</tpl>',
        '</cols>',
        '</tpl>',
        '<tpl if="cachedRows">',
        '<sheetData>{cachedRows}</sheetData>',
        '<tpl if="cachedMergeCells"><mergeCells>{cachedMergeCells}</mergeCells></tpl>',
        '<tpl elseif="rows">',
        '<sheetData><tpl for="rows.items">{[values.render()]}</tpl></sheetData>',
        //'{% debugger; %}',
        '<tpl if="values.self.getMergedCellsNo() &gt; 0">',
        '<mergeCells>',
        '<tpl for="rows.items">',
        '<tpl for="_cells.items">',
        '<tpl if="isMergedCell"><mergeCell ref="{[values.getMergedCellRef()]}"/></tpl>',
        '</tpl>',
        '</tpl>',
        '</mergeCells>',
        '</tpl>',
        '<tpl else>',
        '</sheetData>',
        '</tpl>',
        '</worksheet>'
    ],
    lastRowIndex: 1,
    destroy: function() {
        var me = this;
        Ext.destroy(me.cachedRow);
        me.cachedRow = me.cachedRowConfig = null;
        me.callParent();
    },
    getRenderData: function() {
        this.setMergedCellsNo(0);
        return this.callParent();
    },
    collectFiles: function(files) {
        var pivot = this.getPivotTables(),
            length, i;
        if (pivot) {
            length = pivot.length;
            for (i = 0; i < length; i++) {
                pivot.getAt(i).collectFiles(files);
            }
        }
        this.callParent([
            files
        ]);
    },
    collectContentTypes: function(types) {
        var pivot = this.getPivotTables(),
            length, i;
        if (pivot) {
            length = pivot.length;
            for (i = 0; i < length; i++) {
                pivot.getAt(i).collectContentTypes(types);
            }
        }
        this.callParent([
            types
        ]);
    },
    applyColumns: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.file.ooxml.excel.Column');
    },
    applyRows: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.file.ooxml.excel.Row');
    },
    updateRows: function(collection, oldCollection) {
        var me = this;
        if (oldCollection) {
            oldCollection.un({
                add: me.onRowAdd,
                remove: me.onRowRemove,
                scope: me
            });
        }
        if (collection) {
            collection.on({
                add: me.onRowAdd,
                remove: me.onRowRemove,
                scope: me
            });
            me.onRowAdd(collection, {
                items: collection.getRange()
            });
        }
    },
    onRowAdd: function(collection, details) {
        var items = details.items,
            length = items.length,
            i, item, index;
        for (i = 0; i < length; i++) {
            item = items[i];
            item.setWorksheet(this);
            index = item._index;
            if (!index) {
                item.setIndex(this.lastRowIndex++);
            } else {
                this.lastRowIndex = Math.max(collection.length, index) + 1;
            }
        }
    },
    onRowRemove: function(collection, details) {
        Ext.destroy(details.items);
    },
    updateItemIndexes: function(items) {
        var i, len, item;
        if (!items) {
            return;
        }
        len = items.length;
        for (i = 0; i < len; i++) {
            item = items.getAt(i);
            if (!item.getIndex()) {
                item.setIndex(i + 1);
            }
        }
    },
    updateDrawings: function(data) {
        var rels = this.getRelationships();
        if (oldData && rels) {
            rels.removeRelationship(oldData.getRelationship());
        }
        if (data && rels) {
            rels.addRelationship(data.getRelationship());
        }
    },
    updateTables: function(data) {
        var rels = this.getRelationships();
        if (oldData && rels) {
            rels.removeRelationship(oldData.getRelationship());
        }
        if (data && rels) {
            rels.addRelationship(data.getRelationship());
        }
    },
    applyPivotTables: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.file.ooxml.excel.PivotTable');
    },
    updatePivotTables: function(collection, oldCollection) {
        var me = this;
        if (oldCollection) {
            oldCollection.un({
                add: me.onPivotTableAdd,
                remove: me.onPivotTableRemove,
                scope: me
            });
        }
        if (collection) {
            collection.on({
                add: me.onPivotTableAdd,
                remove: me.onPivotTableRemove,
                scope: me
            });
            this.processPivotTables(collection.getRange());
        }
    },
    onPivotTableAdd: function(collection, details) {
        this.processPivotTables(details.items);
    },
    processPivotTables: function(items) {
        var rels = this.getRelationships(),
            length = items.length,
            i, item;
        for (i = 0; i < length; i++) {
            item = items[i];
            rels.addRelationship(item.getRelationship());
            item.setWorksheet(this);
        }
        this.updateItemIndexes(this.getPivotTables());
    },
    onPivotTableRemove: function(collection, details) {
        var rels = this.getRelationships(),
            length = details.items.length,
            i, item;
        for (i = 0; i < length; i++) {
            item = details.items[i];
            rels.removeRelationship(item.getRelationship());
            Ext.destroy(item);
        }
    },
    /**
     * Convenience method to add column infos.
     * @param {Object/Array} config
     * @return {Ext.exporter.file.ooxml.excel.Column/Ext.exporter.file.ooxml.excel.Column[]}
     */
    addColumn: function(config) {
        if (!this._columns) {
            this.setColumns([]);
        }
        return this._columns.add(config || {});
    },
    /**
     * Convenience method to add rows.
     * @param {Object/Array} config
     * @return {Ext.exporter.file.ooxml.excel.Row/Ext.exporter.file.ooxml.excel.Row[]}
     */
    addRow: function(config) {
        if (!this._rows) {
            this.setRows([]);
        }
        return this._rows.add(config || {});
    },
    /**
     * Convenience method to fetch a row by its id.
     * @param id
     * @return {Ext.exporter.file.ooxml.excel.Row}
     */
    getRow: function(id) {
        return this._rows ? this._rows.get(id) : null;
    },
    /**
     * Convenience method to add pivot tables.
     * @param {Object/Array} config
     * @return {Ext.exporter.file.ooxml.excel.PivotTable/Ext.exporter.file.ooxml.excel.PivotTable[]}
     */
    addPivotTable: function(config) {
        if (!this._pivotTables) {
            this.setPivotTables([]);
        }
        return this._pivotTables.add(config || {});
    },
    /**
     * Convenience method to fetch a pivot table by its id.
     * @param id
     * @return {Ext.exporter.file.ooxml.excel.PivotTable}
     */
    getPivotTable: function(id) {
        return this._pivotTables ? this._pivotTables.get(id) : null;
    },
    beginRowRendering: function() {
        var me = this;
        me.tempRows = [];
        me.tempMergeCells = [];
        me.startCaching = true;
        me.setMergedCellsNo(0);
        me.lastRowIndex = 1;
        me.cachedIndex = 0;
        if (!me.cachedRow) {
            me.cachedRow = new Ext.exporter.file.ooxml.excel.Row({
                worksheet: me
            });
            me.cachedRowConfig = me.cachedRow.getConfig();
            me.cachedRowConfig.id = me.cachedRowConfig.cells = null;
        }
    },
    endRowRendering: function() {
        var me = this;
        me.setCachedRows(me.tempRows.join(''));
        me.setCachedMergeCells(me.tempMergeCells.join(''));
        me.tempRows = me.tempMergeCells = null;
        me.startCaching = false;
        me.lastRowIndex = 1;
    },
    /**
     * Use this method when you don't want to create Row/Cell objects and just render data.
     * Before frequently calling this method you need to call `beginRowRendering` and after that call `endRowRendering`.
     * At the end you can call worksheet.render() and all cached rows will go into the spreadsheet document.
     *
     * @param rows
     * @private
     */
    renderRows: function(rows) {
        var items = Ext.Array.from(rows),
            len = items.length,
            i;
        for (i = 0; i < len; i++) {
            this.renderRow(items[i]);
        }
    },
    renderRow: function(row) {
        var me = this,
            config, len, i, cache, index, cells, ret;
        if (!me.startCaching) {
            me.beginRowRendering();
        }
        cache = me.cachedRow;
        if (Ext.isArray(row)) {
            cells = row;
            config = {};
        } else {
            config = row;
            cells = Ext.Array.from(config.cells || []);
        }
        delete (config.cells);
        Ext.applyIf(config, me.cachedRowConfig);
        //cache.setConfig(config); setConfig is expensive
        cache.setCollapsed(config.collapsed);
        cache.setHidden(config.hidden);
        cache.setHeight(config.height);
        cache.setOutlineLevel(config.outlineLevel);
        cache.setShowPhonetic(config.showPhonetic);
        cache.setStyleId(config.styleId);
        cache.setIndex(config.index);
        index = cache.getIndex();
        if (!index) {
            cache.setIndex(me.lastRowIndex++);
        } else {
            me.lastRowIndex = Math.max(me.lastRowIndex, index) + 1;
        }
        ret = cache.renderCells(cells);
        me.tempRows.push(ret.row);
        if (me.cachedIndex === 0) {
            me._topLeftRef = ret.first;
        }
        me._bottomRightRef = ret.last;
        me.tempMergeCells.push(ret.merged);
        me.cachedIndex++;
        // returns an object with references for first and last cell
        ret.rowIndex = cache.getIndex();
        return ret;
    }
});

/**
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.excel.Font', {
    extend: 'Ext.exporter.file.ooxml.Base',
    config: {
        size: 10,
        fontName: '',
        family: null,
        // 1: Roman, 2: Swiss, 3: Modern, 4: Script, 5: Decorative
        charset: null,
        bold: false,
        italic: false,
        underline: false,
        outline: false,
        strikeThrough: false,
        color: null,
        // rgb color
        verticalAlign: null
    },
    // `baseline`, `superscript`, `subscript`
    mappings: {
        family: {
            Automatic: 0,
            Roman: 1,
            Swiss: 2,
            Modern: 3,
            Script: 4,
            Decorative: 5
        }
    },
    tpl: [
        '<font>',
        '<tpl if="size"><sz val="{size}"/></tpl>',
        '<tpl if="fontName"><name val="{fontName}"/></tpl>',
        '<tpl if="family"><family val="{family}"/></tpl>',
        '<tpl if="charset"><charset val="{charset}"/></tpl>',
        '<tpl if="bold"><b/></tpl>',
        '<tpl if="italic"><i/></tpl>',
        '<tpl if="underline"><u/></tpl>',
        '<tpl if="outline"><outline/></tpl>',
        '<tpl if="strikeThrough"><strike/></tpl>',
        '<tpl if="color"><color rgb="{color}"/></tpl>',
        '<tpl if="verticalAlign"><vertAlign val="{verticalAlign}"/></tpl>',
        '</font>'
    ],
    constructor: function(config) {
        var cfg = {},
            keys = Ext.Object.getKeys(config || {}),
            len = keys.length,
            i;
        if (config) {
            for (i = 0; i < len; i++) {
                cfg[Ext.String.uncapitalize(keys[i])] = config[keys[i]];
            }
        }
        this.callParent([
            cfg
        ]);
    },
    applyFamily: function(value) {
        if (typeof value === 'string') {
            return this.mappings.family[value];
        }
        return value;
    },
    applyBold: function(value) {
        return !!value;
    },
    applyItalic: function(value) {
        return !!value;
    },
    applyStrikeThrough: function(value) {
        return !!value;
    },
    applyUnderline: function(value) {
        return !!value;
    },
    applyOutline: function(value) {
        return !!value;
    },
    applyColor: function(value) {
        var v;
        if (!value) {
            return value;
        }
        v = String(value);
        return v.indexOf('#') >= 0 ? v.replace('#', '') : v;
    },
    applyVerticalAlign: function(value) {
        return Ext.util.Format.lowercase(value);
    }
});

/**
 * Possible values for numFmtId:
 *
 * -  0 - General
 * -  1 - 0
 * -  2 - 0.00
 * -  3 - #,##0
 * -  4 - #,##0.00
 * -  9 - 0%
 * - 10 - 0.00%
 * - 11 - 0.00E+00
 * - 12 - # ?/?
 * - 13 - # ??/??
 * - 14 - mm-dd-yy
 * - 15 - d-mmm-yy
 * - 16 - d-mmm
 * - 17 - mmm-yy
 * - 18 - h:mm AM/PM
 * - 19 - h:mm:ss AM/PM
 * - 20 - h:mm
 * - 21 - h:mm:ss
 * - 22 - m/d/yy h:mm
 * - 37 - #,##0 ;(#,##0)
 * - 38 - #,##0 ;[Red](#,##0)
 * - 39 - #,##0.00;(#,##0.00)
 * - 40 - #,##0.00;[Red](#,##0.00)
 * - 45 - mm:ss
 * - 46 - [h]:mm:ss
 * - 47 - mmss.0
 * - 48 - ##0.0E+0
 * - 49 - @
 *
 *
 * If in your XF object you use one of the numFmtId listed above then there's no need to define a NumberFormat object.
 *
 *
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.excel.NumberFormat', {
    extend: 'Ext.exporter.file.ooxml.Base',
    config: {
        isDate: false,
        numFmtId: null,
        formatCode: ''
    },
    tpl: [
        '<numFmt numFmtId="{numFmtId}" formatCode="{formatCode:htmlEncode}"/>'
    ],
    spaceRe: /(,| )/g,
    getRenderData: function() {
        var data = this.callParent(),
            fmt = data.formatCode;
        fmt = (fmt && data.isDate) ? fmt.replace(this.spaceRe, '\\$1') : fmt;
        data.formatCode = fmt;
        return data;
    },
    getKey: function() {
        return this.getFormatCode();
    }
});

/**
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.excel.Fill', {
    extend: 'Ext.exporter.file.ooxml.Base',
    requires: [
        'Ext.util.Format'
    ],
    config: {
        /**
         * Possible values:
         * - none
         * - solid
         * - mediumGray
         * - darkGray
         * - lightGray
         * - darkHorizontal
         * - darkVertical
         * - darkDown
         * - darkUp
         * - darkGrid
         * - darkTrellis
         * - lightHorizontal
         * - lightVertical
         * - lightDown
         * - lightUp
         * - lightGrid
         * - lightTrellis
         * - gray125
         * - gray0625
         */
        patternType: 'none',
        fgColor: null,
        bgColor: null
    },
    tpl: [
        '<fill>',
        '<tpl if="fgColor || bgColor">',
        '<patternFill patternType="{patternType}">',
        '<tpl if="fgColor"><fgColor rgb="{fgColor}"></fgColor></tpl>',
        '<tpl if="bgColor"><bgColor rgb="{bgColor}"></bgColor></tpl>',
        '</patternFill>',
        '<tpl else>',
        '<patternFill patternType="{patternType}"/>',
        '</tpl>',
        '</fill>'
    ],
    constructor: function(config) {
        var cfg = {};
        if (config) {
            cfg.id = config.id;
            cfg.bgColor = config.Color || null;
            cfg.patternType = config.Pattern || null;
        }
        this.callParent([
            cfg
        ]);
    },
    formatColor: function(value) {
        var v;
        if (!value) {
            return value;
        }
        v = String(value);
        return v.indexOf('#') >= 0 ? v.replace('#', '') : v;
    },
    applyFgColor: function(value) {
        return this.formatColor(value);
    },
    applyBgColor: function(value) {
        return this.formatColor(value);
    },
    applyPatternType: function(value) {
        var possible = [
                'none',
                'solid',
                'mediumGray',
                'darkGray',
                'lightGray',
                'darkHorizontal',
                'darkVertical',
                'darkDown',
                'darkUp',
                'darkGrid',
                'darkTrellis',
                'lightHorizontal',
                'lightVertical',
                'lightDown',
                'lightUp',
                'lightGrid',
                'lightTrellis',
                'gray125',
                'gray0625'
            ],
            v = Ext.util.Format.uncapitalize(value);
        return Ext.Array.indexOf(possible, v) >= 0 ? v : 'none';
    }
});

/**
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.excel.BorderPr', {
    extend: 'Ext.exporter.file.ooxml.Base',
    isBorderPr: true,
    config: {
        tag: 'left',
        color: null,
        /**
         * Possible values:
         * - none
         * - thin
         * - medium
         * - dashed
         * - dotted
         * - thick
         * - double
         * - hair
         * - mediumDashed
         * - dashDot
         * - mediumDashDot
         * - dashDotDot
         * - mediumDashDotDot
         * - slantDashDot
         */
        lineStyle: 'none'
    },
    mappings: {
        lineStyle: {
            'None': 'none',
            'Continuous': 'thin',
            'Dash': 'dashed',
            'Dot': 'dotted',
            'DashDot': 'dashDot',
            'DashDotDot': 'dashDotDot',
            'SlantDashDot': 'slantDashDot',
            'Double': 'double'
        }
    },
    tpl: [
        '<tpl if="color">',
        '<{tag} style="{lineStyle}"><color rgb="{color}"/></{tag}>',
        '<tpl else>',
        '<{tag} style="{lineStyle}"/>',
        '</tpl>'
    ],
    applyColor: function(value) {
        var v;
        if (!value) {
            return value;
        }
        v = String(value);
        return v.indexOf('#') >= 0 ? v.replace('#', '') : v;
    },
    applyLineStyle: function(value) {
        var possible = [
                'none',
                'thin',
                'medium',
                'dashed',
                'dotted',
                'thick',
                'double',
                'hair',
                'mediumDashed',
                'dashDot',
                'mediumDashDot',
                'dashDotDot',
                'mediumDashDotDot',
                'slantDashDot'
            ];
        return Ext.Array.indexOf(possible, value) >= 0 ? value : (this.mappings.lineStyle[value] || 'none');
    }
});

/**
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.excel.Border', {
    extend: 'Ext.exporter.file.ooxml.Base',
    requires: [
        'Ext.exporter.file.ooxml.excel.BorderPr'
    ],
    config: {
        /**
         * @cfg {Ext.exporter.file.ooxml.excel.BorderPr} left
         *
         * Left border settings
         */
        left: null,
        /**
         * @cfg {Ext.exporter.file.ooxml.excel.BorderPr} right
         *
         * Right border settings
         */
        right: null,
        /**
         * @cfg {Ext.exporter.file.ooxml.excel.BorderPr} top
         *
         * Top border settings
         */
        top: null,
        /**
         * @cfg {Ext.exporter.file.ooxml.excel.BorderPr} bottom
         *
         * Bottom border settings
         */
        bottom: null
    },
    tpl: [
        '<border>',
        '<tpl if="left">{[values.left.render()]}</tpl>',
        '<tpl if="right">{[values.right.render()]}</tpl>',
        '<tpl if="top">{[values.top.render()]}</tpl>',
        '<tpl if="bottom">{[values.bottom.render()]}</tpl>',
        '</border>'
    ],
    destroy: function() {
        this.setConfig({
            left: null,
            right: null,
            top: null,
            bottom: null
        });
        this.callParent();
    },
    applyLeft: function(border) {
        if (border && !border.isBorderPr) {
            return new Ext.exporter.file.ooxml.excel.BorderPr(border);
        }
        return border;
    },
    applyTop: function(border) {
        if (border && !border.isBorderPr) {
            return new Ext.exporter.file.ooxml.excel.BorderPr(border);
        }
        return border;
    },
    applyRight: function(border) {
        if (border && !border.isBorderPr) {
            return new Ext.exporter.file.ooxml.excel.BorderPr(border);
        }
        return border;
    },
    applyBottom: function(border) {
        if (border && !border.isBorderPr) {
            return new Ext.exporter.file.ooxml.excel.BorderPr(border);
        }
        return border;
    },
    updateLeft: function(border, oldData) {
        Ext.destroy(oldData);
        if (border) {
            border.setTag('left');
        }
    },
    updateTop: function(border, oldData) {
        Ext.destroy(oldData);
        if (border) {
            border.setTag('top');
        }
    },
    updateRight: function(border, oldData) {
        Ext.destroy(oldData);
        if (border) {
            border.setTag('right');
        }
    },
    updateBottom: function(border, oldData) {
        Ext.destroy(oldData);
        if (border) {
            border.setTag('bottom');
        }
    }
});

/**
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.excel.CellAlignment', {
    extend: 'Ext.exporter.file.ooxml.Base',
    isCellAlignment: true,
    config: {
        /**
         * Possible values:
         * - general
         * - left
         * - center
         * - right
         * - fill
         * - justify
         * - centerContinuous
         * - distributed
         */
        horizontal: 'general',
        /**
         * Possible values:
         * - top
         * - center
         * - bottom
         * - justify
         * - distributed
         */
        vertical: 'top',
        rotate: null,
        wrapText: false,
        indent: null,
        relativeIndent: null,
        justifyLastLine: false,
        shrinkToFit: false,
        /**
         * An integer value indicating whether the reading order (bidirectionality) of the cell is left- to-right, right-to-left, or context dependent.
         *
         * 0 - Context Dependent - reading order is determined by scanning the text for the first non-whitespace character: if it is a strong right-to-left character, the reading order is right-to-left; otherwise, the reading order left-to-right.
         * 1 - Left-to-Right- reading order is left-to-right in the cell, as in English.
         * 2 - Right-to-Left - reading order is right-to-left in the cell, as in Hebrew.
         *
         * The possible values for this attribute are defined by the W3C XML Schema unsignedInt datatype.
         */
        readingOrder: null
    },
    mappings: {
        horizontal: {
            Automatic: 'general',
            CenterAcrossSelection: 'centerContinuous',
            JustifyDistributed: 'distributed'
        },
        vertical: {
            Automatic: 'top',
            JustifyDistributed: 'distributed'
        },
        readingOrder: {
            Context: 0,
            LeftToRight: 1,
            RightToLeft: 2
        }
    },
    tpl: [
        '<alignment',
        '<tpl if="horizontal"> horizontal="{horizontal}"</tpl>',
        '<tpl if="vertical"> vertical="{vertical}"</tpl>',
        '<tpl if="rotate"> textRotation="{rotate}"</tpl>',
        '<tpl if="wrapText"> wrapText="{wrapText}"</tpl>',
        '<tpl if="indent"> indent="{indent}"</tpl>',
        '<tpl if="relativeIndent"> relativeIndent="{relativeIndent}"</tpl>',
        '<tpl if="justifyLastLine"> justifyLastLine="{justifyLastLine}"</tpl>',
        '<tpl if="shrinkToFit"> shrinkToFit="{shrinkToFit}"</tpl>',
        '<tpl if="readingOrder"> readingOrder="{readingOrder}"</tpl>',
        '/>'
    ],
    constructor: function(config) {
        var cfg = {},
            keys = Ext.Object.getKeys(config || {}),
            len = keys.length,
            i;
        if (config) {
            for (i = 0; i < len; i++) {
                cfg[Ext.String.uncapitalize(keys[i])] = config[keys[i]];
            }
        }
        this.callParent([
            cfg
        ]);
    },
    applyHorizontal: function(value) {
        var possible = [
                'general',
                'left',
                'center',
                'right',
                'fill',
                'justify',
                'centerContinuous',
                'distributed'
            ],
            v = Ext.util.Format.uncapitalize(value);
        return Ext.Array.indexOf(possible, v) >= 0 ? v : (this.mappings.horizontal[value] || 'general');
    },
    applyVertical: function(value) {
        var possible = [
                'top',
                'center',
                'bottom',
                'justify',
                'distributed'
            ],
            v = Ext.util.Format.uncapitalize(value);
        return Ext.Array.indexOf(possible, v) >= 0 ? v : (this.mappings.vertical[value] || 'top');
    },
    applyReadingOrder: function(value) {
        if (typeof value === 'string') {
            return this.mappings.readingOrder[value] || 0;
        }
        return value;
    }
});

/**
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.excel.CellStyleXf', {
    extend: 'Ext.exporter.file.ooxml.Base',
    requires: [
        'Ext.exporter.file.ooxml.excel.CellAlignment'
    ],
    config: {
        numFmtId: 0,
        fontId: 0,
        fillId: 0,
        borderId: 0,
        alignment: null
    },
    tpl: [
        '<xf numFmtId="{numFmtId}" fontId="{fontId}" fillId="{fillId}" borderId="{borderId}" <tpl if="fontId"> applyFont="1"</tpl>',
        '<tpl if="alignment">',
        ' applyAlignment="1">{[values.alignment.render()]}</xf>',
        '<tpl else>',
        '/>',
        '</tpl>'
    ],
    applyAlignment: function(align) {
        if (align && !align.isCellAlignment) {
            return new Ext.exporter.file.ooxml.excel.CellAlignment(align);
        }
        return align;
    }
});

/**
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.excel.CellXf', {
    extend: 'Ext.exporter.file.ooxml.excel.CellStyleXf',
    config: {
        xfId: 0
    },
    tpl: [
        '<xf numFmtId="{numFmtId}" fontId="{fontId}" fillId="{fillId}" borderId="{borderId}" xfId="{xfId}"',
        '<tpl if="numFmtId"> applyNumberFormat="1"</tpl>',
        '<tpl if="fillId"> applyFill="1"</tpl>',
        '<tpl if="borderId"> applyBorder="1"</tpl>',
        '<tpl if="fontId"> applyFont="1"</tpl>',
        '<tpl if="alignment">',
        ' applyAlignment="1">{[values.alignment.render()]}</xf>',
        '<tpl else>',
        '/>',
        '</tpl>'
    ]
});

/**
 * This is the root element of the Styles part.
 *
 * [CT_Stylesheet]
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.excel.Stylesheet', {
    extend: 'Ext.exporter.file.ooxml.Xml',
    requires: [
        'Ext.exporter.file.Style',
        'Ext.exporter.file.ooxml.excel.Font',
        'Ext.exporter.file.ooxml.excel.NumberFormat',
        'Ext.exporter.file.ooxml.excel.Fill',
        'Ext.exporter.file.ooxml.excel.Border',
        'Ext.exporter.file.ooxml.excel.CellXf'
    ],
    isStylesheet: true,
    config: {
        fonts: [
            {
                fontName: 'Arial',
                size: 10,
                family: 2
            }
        ],
        numberFormats: null,
        fills: [
            {
                patternType: 'none'
            }
        ],
        borders: [
            {
                left: {},
                top: {},
                right: {},
                bottom: {}
            }
        ],
        cellStyleXfs: [
            {}
        ],
        cellXfs: [
            {}
        ]
    },
    contentType: {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml'
    },
    relationship: {
        schema: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles'
    },
    folder: '/xl/',
    fileName: 'styles',
    tpl: [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">',
        '<tpl if="numberFormats"><numFmts count="{numberFormats.length}"><tpl for="numberFormats.items">{[values.render()]}</tpl></numFmts></tpl>',
        '<tpl if="fonts"><fonts count="{fonts.length}"><tpl for="fonts.items">{[values.render()]}</tpl></fonts></tpl>',
        '<tpl if="fills"><fills count="{fills.length}"><tpl for="fills.items">{[values.render()]}</tpl></fills></tpl>',
        '<tpl if="borders"><borders count="{borders.length}"><tpl for="borders.items">{[values.render()]}</tpl></borders></tpl>',
        '<tpl if="cellStyleXfs"><cellStyleXfs count="{cellStyleXfs.length}"><tpl for="cellStyleXfs.items">{[values.render()]}</tpl></cellStyleXfs></tpl>',
        '<tpl if="cellXfs"><cellXfs count="{cellXfs.length}"><tpl for="cellXfs.items">{[values.render()]}</tpl></cellXfs></tpl>',
        '<tableStyles count="0" defaultTableStyle="TableStyleMedium9" defaultPivotStyle="PivotStyleMedium7"/>',
        '</styleSheet>'
    ],
    lastNumberFormatId: 164,
    datePatterns: {
        'General Date': '[$-F800]dddd, mmmm dd, yyyy',
        'Long Date': '[$-F800]dddd, mmmm dd, yyyy',
        'Medium Date': 'mm/dd/yy;@',
        'Short Date': 'm/d/yy;@',
        'Long Time': 'h:mm:ss;@',
        'Medium Time': '[$-409]h:mm AM/PM;@',
        'Short Time': 'h:mm;@'
    },
    numberPatterns: {
        'General Number': 1,
        'Fixed': 2,
        'Standard': 2,
        'Percent': 10,
        'Scientific': 11,
        'Currency': '"$"#,##0.00',
        'Euro Currency': '"€"#,##0.00'
    },
    booleanPatterns: {
        'Yes/No': '"Yes";-;"No"',
        'True/False': '"True";-;"False"',
        'On/Off': '"On";-;"Off"'
    },
    applyFonts: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.file.ooxml.excel.Font');
    },
    applyNumberFormats: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.file.ooxml.excel.NumberFormat');
    },
    applyFills: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.file.ooxml.excel.Fill');
    },
    applyBorders: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.file.ooxml.excel.Border');
    },
    applyCellXfs: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.file.ooxml.excel.CellXf');
    },
    applyCellStyleXfs: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.file.ooxml.excel.CellStyleXf');
    },
    addFont: function(config) {
        var col = this._fonts,
            ret;
        if (!col) {
            this.setFonts([]);
            col = this._fonts;
        }
        ret = col.add(config);
        return col.indexOf(ret);
    },
    addNumberFormat: function(config) {
        var col = this._numberFormats,
            ret, temp;
        if (!col) {
            this.setNumberFormats([]);
            col = this._numberFormats;
        }
        temp = new Ext.exporter.file.ooxml.excel.NumberFormat(config);
        ret = col.get(temp.getKey());
        if (!ret) {
            ret = temp;
            col.add(ret);
            ret.setNumFmtId(this.lastNumberFormatId++);
        }
        return ret.getNumFmtId();
    },
    addFill: function(config) {
        var col = this._fills,
            ret;
        if (!col) {
            this.setFills([]);
            col = this._fills;
        }
        ret = col.add(config);
        return col.indexOf(ret);
    },
    addBorder: function(config) {
        var col = this._borders,
            ret;
        if (!col) {
            this.setBorders([]);
            col = this._borders;
        }
        ret = col.add(config);
        return col.indexOf(ret);
    },
    addCellXf: function(config) {
        var col = this._cellXfs,
            ret;
        if (!col) {
            this.setCellXfs([]);
            col = this._cellXfs;
        }
        ret = col.add(config);
        return col.indexOf(ret);
    },
    addCellStyleXf: function(config) {
        var col = this._cellStyleXfs,
            ret;
        if (!col) {
            this.setCellStyleXfs([]);
            col = this._cellStyleXfs;
        }
        ret = col.add(config);
        return col.indexOf(ret);
    },
    getStyleParams: function(style) {
        var me = this,
            s = new Ext.exporter.file.Style(style),
            cfg = s.getConfig(),
            numFmtId = 0,
            fontId = 0,
            fillId = 0,
            borderId = 0,
            xfId = 0;
        cfg.parentId = style ? style.parentId : null;
        if (cfg.font) {
            fontId = me.addFont(cfg.font);
        }
        if (cfg.format) {
            numFmtId = me.getNumberFormatId(cfg.format);
        }
        if (cfg.interior) {
            fillId = me.addFill(cfg.interior);
        }
        if (cfg.borders) {
            borderId = me.getBorderId(cfg.borders);
        }
        if (cfg.parentId) {
            xfId = cfg.parentId;
        }
        return {
            numFmtId: numFmtId,
            fontId: fontId,
            fillId: fillId,
            borderId: borderId,
            xfId: xfId,
            alignment: cfg.alignment || null
        };
    },
    /**
     * Convenience method to add a new style. The returned index may be used as `styleId` in a Row or Cell.
     *
     * @param {Ext.exporter.file.Style} style
     * @return The index of the newly added {Ext.exporter.file.ooxml.excel.CellStyleXf} object
     */
    addStyle: function(style) {
        return this.addCellStyleXf(this.getStyleParams(style));
    },
    /**
     * Add a cell specific style.
     *
     * @param {Ext.exporter.file.Style} style
     * @return The index of the newly added {Ext.exporter.file.ooxml.excel.CellXf} object
     */
    addCellStyle: function(style) {
        return this.addCellXf(this.getStyleParams(style));
    },
    getNumberFormatId: function(f) {
        var me = this,
            isDate = !!me.datePatterns[f],
            id, code;
        if (f === 'General') {
            return 0;
        }
        code = me.datePatterns[f] || me.booleanPatterns[f] || me.numberPatterns[f];
        if (Ext.isNumeric(code)) {
            id = code;
        } else if (!code) {
            code = f;
        }
        return id || me.addNumberFormat({
            isDate: isDate,
            formatCode: code
        });
    },
    getBorderId: function(borders) {
        var cfg = {},
            len = borders.length,
            i, b, key;
        for (i = 0; i < len; i++) {
            b = borders[i];
            key = Ext.util.Format.lowercase(b.position);
            delete (b.position);
            cfg[key] = b;
        }
        return this.addBorder(cfg);
    }
});

/**
 * A workbook can contain thousands of cells containing string (non-numeric) data. Furthermore this
 * data is very likely to be repeated across many rows or columns. The goal of implementing a single
 * string table that is shared across the workbook is to improve performance in opening and saving
 * the file by only reading and writing the repetitive information once.
 *
 * [Example: Consider for example a workbook summarizing information for cities within various countries.
 * There can be a column for the name of the country, a column for the name of each city in that country,
 * and a column containing the data for each city. In this case the country name is repetitive, being
 * duplicated in many cells. end example] In many cases the repetition is extensive, and significant savings
 * are realized by making use of a shared string table when saving the workbook. When displaying text in
 * the spreadsheet, the cell table will just contain an index into the string table as the value of a cell,
 * instead of the full string.
 *
 * The shared string table is permitted to contain all the necessary information for displaying the string:
 * the text, formatting properties, and phonetic properties (for East Asian languages).
 *
 * Most strings in a workbook have formatting applied at the cell level, that is, the entire string in the
 * cell has the same formatting applied. In these cases, the formatting for the cell is stored in the styles
 * part, and the string for the cell can be stored in the shared strings table. In this case, the strings
 * stored in the shared strings table are very simple text elements.
 *
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.excel.SharedStrings', {
    extend: 'Ext.exporter.file.ooxml.Xml',
    isSharedStrings: true,
    config: {
        strings: []
    },
    contentType: {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml'
    },
    relationship: {
        schema: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings'
    },
    folder: '/xl/',
    fileName: 'sharedStrings',
    tpl: [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="{strings.length}" uniqueCount="{strings.length}">',
        '<tpl for="strings"><si><t>{.:this.utf8}</t></si></tpl>',
        '</sst>',
        {
            utf8: function(v) {
                return Ext.util.Base64._utf8_encode(v);
            }
        }
    ],
    destroy: function() {
        this.setStrings(null);
        this.callParent();
    },
    addString: function(value) {
        var v = Ext.util.Format.htmlEncode(value),
            s = this.getStrings(),
            index = Ext.Array.indexOf(s, v);
        if (index < 0) {
            s.push(v);
            index = s.length - 1;
        }
        return index;
    }
});

/**
 * The theme is the root-level complex type associated with a shared-style sheet.
 * This complex type holds all of the different formatting options available to a
 * theme, and defines the overall look and feel of a document when themed objects
 * are used within the document.
 *
 * A theme consists of four main parts, although the themeElements element is the
 * piece that holds the main formatting defined within the theme. The other parts
 * provide overrides, defaults, and additions to the information contained in
 * themeElements.
 *
 * (CT_OfficeStyleSheet)
 * @private
 * @TODO
 */
Ext.define('Ext.exporter.file.ooxml.theme.Base', {
    extend: 'Ext.exporter.file.ooxml.XmlRels',
    alias: 'ooxmltheme.base',
    mixins: [
        'Ext.mixin.Factoryable'
    ],
    config: {
        xml: null
    },
    tpl: '{xml}',
    folder: '/theme/',
    fileName: 'theme',
    contentType: {
        contentType: 'application/vnd.openxmlformats-officedocument.theme+xml'
    },
    relationship: {
        schema: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme'
    }
});

/**
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.theme.Office', {
    extend: 'Ext.exporter.file.ooxml.theme.Base',
    alias: 'ooxmltheme.office',
    xml: [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="Office Theme">',
        '<a:themeElements>',
        '<a:clrScheme name="Office">',
        '<a:dk1>',
        '<a:sysClr val="windowText" lastClr="000000"/>',
        '</a:dk1>',
        '<a:lt1>',
        '<a:sysClr val="window" lastClr="FFFFFF"/>',
        '</a:lt1>',
        '<a:dk2>',
        '<a:srgbClr val="44546A"/>',
        '</a:dk2>',
        '<a:lt2>',
        '<a:srgbClr val="E7E6E6"/>',
        '</a:lt2>',
        '<a:accent1>',
        '<a:srgbClr val="4472C4"/>',
        '</a:accent1>',
        '<a:accent2>',
        '<a:srgbClr val="ED7D31"/>',
        '</a:accent2>',
        '<a:accent3>',
        '<a:srgbClr val="A5A5A5"/>',
        '</a:accent3>',
        '<a:accent4>',
        '<a:srgbClr val="FFC000"/>',
        '</a:accent4>',
        '<a:accent5>',
        '<a:srgbClr val="5B9BD5"/>',
        '</a:accent5>',
        '<a:accent6>',
        '<a:srgbClr val="70AD47"/>',
        '</a:accent6>',
        '<a:hlink>',
        '<a:srgbClr val="0563C1"/>',
        '</a:hlink>',
        '<a:folHlink>',
        '<a:srgbClr val="954F72"/>',
        '</a:folHlink>',
        '</a:clrScheme>',
        '<a:fontScheme name="Office">',
        '<a:majorFont>',
        '<a:latin typeface="Calibri Light" panose="020F0302020204030204"/>',
        '<a:ea typeface=""/>',
        '<a:cs typeface=""/>',
        '<a:font script="Jpan" typeface="Yu Gothic Light"/>',
        // '<a:font script="Hang" typeface="맑은 고딕"/>',
        '<a:font script="Hans" typeface="DengXian Light"/>',
        // '<a:font script="Hant" typeface="新細明體"/>',
        '<a:font script="Arab" typeface="Times New Roman"/>',
        '<a:font script="Hebr" typeface="Times New Roman"/>',
        '<a:font script="Thai" typeface="Tahoma"/>',
        '<a:font script="Ethi" typeface="Nyala"/>',
        '<a:font script="Beng" typeface="Vrinda"/>',
        '<a:font script="Gujr" typeface="Shruti"/>',
        '<a:font script="Khmr" typeface="MoolBoran"/>',
        '<a:font script="Knda" typeface="Tunga"/>',
        '<a:font script="Guru" typeface="Raavi"/>',
        '<a:font script="Cans" typeface="Euphemia"/>',
        '<a:font script="Cher" typeface="Plantagenet Cherokee"/>',
        '<a:font script="Yiii" typeface="Microsoft Yi Baiti"/>',
        '<a:font script="Tibt" typeface="Microsoft Himalaya"/>',
        '<a:font script="Thaa" typeface="MV Boli"/>',
        '<a:font script="Deva" typeface="Mangal"/>',
        '<a:font script="Telu" typeface="Gautami"/>',
        '<a:font script="Taml" typeface="Latha"/>',
        '<a:font script="Syrc" typeface="Estrangelo Edessa"/>',
        '<a:font script="Orya" typeface="Kalinga"/>',
        '<a:font script="Mlym" typeface="Kartika"/>',
        '<a:font script="Laoo" typeface="DokChampa"/>',
        '<a:font script="Sinh" typeface="Iskoola Pota"/>',
        '<a:font script="Mong" typeface="Mongolian Baiti"/>',
        '<a:font script="Viet" typeface="Times New Roman"/>',
        '<a:font script="Uigh" typeface="Microsoft Uighur"/>',
        '<a:font script="Geor" typeface="Sylfaen"/>',
        '</a:majorFont>',
        '<a:minorFont>',
        '<a:latin typeface="Calibri" panose="020F0502020204030204"/>',
        '<a:ea typeface=""/>',
        '<a:cs typeface=""/>',
        '<a:font script="Jpan" typeface="Yu Gothic"/>',
        // '<a:font script="Hang" typeface="맑은 고딕"/>',
        '<a:font script="Hans" typeface="DengXian"/>',
        // '<a:font script="Hant" typeface="新細明體"/>',
        '<a:font script="Arab" typeface="Arial"/>',
        '<a:font script="Hebr" typeface="Arial"/>',
        '<a:font script="Thai" typeface="Tahoma"/>',
        '<a:font script="Ethi" typeface="Nyala"/>',
        '<a:font script="Beng" typeface="Vrinda"/>',
        '<a:font script="Gujr" typeface="Shruti"/>',
        '<a:font script="Khmr" typeface="DaunPenh"/>',
        '<a:font script="Knda" typeface="Tunga"/>',
        '<a:font script="Guru" typeface="Raavi"/>',
        '<a:font script="Cans" typeface="Euphemia"/>',
        '<a:font script="Cher" typeface="Plantagenet Cherokee"/>',
        '<a:font script="Yiii" typeface="Microsoft Yi Baiti"/>',
        '<a:font script="Tibt" typeface="Microsoft Himalaya"/>',
        '<a:font script="Thaa" typeface="MV Boli"/>',
        '<a:font script="Deva" typeface="Mangal"/>',
        '<a:font script="Telu" typeface="Gautami"/>',
        '<a:font script="Taml" typeface="Latha"/>',
        '<a:font script="Syrc" typeface="Estrangelo Edessa"/>',
        '<a:font script="Orya" typeface="Kalinga"/>',
        '<a:font script="Mlym" typeface="Kartika"/>',
        '<a:font script="Laoo" typeface="DokChampa"/>',
        '<a:font script="Sinh" typeface="Iskoola Pota"/>',
        '<a:font script="Mong" typeface="Mongolian Baiti"/>',
        '<a:font script="Viet" typeface="Arial"/>',
        '<a:font script="Uigh" typeface="Microsoft Uighur"/>',
        '<a:font script="Geor" typeface="Sylfaen"/>',
        '</a:minorFont>',
        '</a:fontScheme>',
        '<a:fmtScheme name="Office">',
        '<a:fillStyleLst>',
        '<a:solidFill>',
        '<a:schemeClr val="phClr"/>',
        '</a:solidFill>',
        '<a:gradFill rotWithShape="1">',
        '<a:gsLst>',
        '<a:gs pos="0">',
        '<a:schemeClr val="phClr">',
        '<a:lumMod val="110000"/>',
        '<a:satMod val="105000"/>',
        '<a:tint val="67000"/>',
        '</a:schemeClr>',
        '</a:gs>',
        '<a:gs pos="50000">',
        '<a:schemeClr val="phClr">',
        '<a:lumMod val="105000"/>',
        '<a:satMod val="103000"/>',
        '<a:tint val="73000"/>',
        '</a:schemeClr>',
        '</a:gs>',
        '<a:gs pos="100000">',
        '<a:schemeClr val="phClr">',
        '<a:lumMod val="105000"/>',
        '<a:satMod val="109000"/>',
        '<a:tint val="81000"/>',
        '</a:schemeClr>',
        '</a:gs>',
        '</a:gsLst>',
        '<a:lin ang="5400000" scaled="0"/>',
        '</a:gradFill>',
        '<a:gradFill rotWithShape="1">',
        '<a:gsLst>',
        '<a:gs pos="0">',
        '<a:schemeClr val="phClr">',
        '<a:satMod val="103000"/>',
        '<a:lumMod val="102000"/>',
        '<a:tint val="94000"/>',
        '</a:schemeClr>',
        '</a:gs>',
        '<a:gs pos="50000">',
        '<a:schemeClr val="phClr">',
        '<a:satMod val="110000"/>',
        '<a:lumMod val="100000"/>',
        '<a:shade val="100000"/>',
        '</a:schemeClr>',
        '</a:gs>',
        '<a:gs pos="100000">',
        '<a:schemeClr val="phClr">',
        '<a:lumMod val="99000"/>',
        '<a:satMod val="120000"/>',
        '<a:shade val="78000"/>',
        '</a:schemeClr>',
        '</a:gs>',
        '</a:gsLst>',
        '<a:lin ang="5400000" scaled="0"/>',
        '</a:gradFill>',
        '</a:fillStyleLst>',
        '<a:lnStyleLst>',
        '<a:ln w="6350" cap="flat" cmpd="sng" algn="ctr">',
        '<a:solidFill>',
        '<a:schemeClr val="phClr"/>',
        '</a:solidFill>',
        '<a:prstDash val="solid"/>',
        '<a:miter lim="800000"/>',
        '</a:ln>',
        '<a:ln w="12700" cap="flat" cmpd="sng" algn="ctr">',
        '<a:solidFill>',
        '<a:schemeClr val="phClr"/>',
        '</a:solidFill>',
        '<a:prstDash val="solid"/>',
        '<a:miter lim="800000"/>',
        '</a:ln>',
        '<a:ln w="19050" cap="flat" cmpd="sng" algn="ctr">',
        '<a:solidFill>',
        '<a:schemeClr val="phClr"/>',
        '</a:solidFill>',
        '<a:prstDash val="solid"/>',
        '<a:miter lim="800000"/>',
        '</a:ln>',
        '</a:lnStyleLst>',
        '<a:effectStyleLst>',
        '<a:effectStyle>',
        '<a:effectLst/>',
        '</a:effectStyle>',
        '<a:effectStyle>',
        '<a:effectLst/>',
        '</a:effectStyle>',
        '<a:effectStyle>',
        '<a:effectLst>',
        '<a:outerShdw blurRad="57150" dist="19050" dir="5400000" algn="ctr" rotWithShape="0">',
        '<a:srgbClr val="000000">',
        '<a:alpha val="63000"/>',
        '</a:srgbClr>',
        '</a:outerShdw>',
        '</a:effectLst>',
        '</a:effectStyle>',
        '</a:effectStyleLst>',
        '<a:bgFillStyleLst>',
        '<a:solidFill>',
        '<a:schemeClr val="phClr"/>',
        '</a:solidFill>',
        '<a:solidFill>',
        '<a:schemeClr val="phClr">',
        '<a:tint val="95000"/>',
        '<a:satMod val="170000"/>',
        '</a:schemeClr>',
        '</a:solidFill>',
        '<a:gradFill rotWithShape="1">',
        '<a:gsLst>',
        '<a:gs pos="0">',
        '<a:schemeClr val="phClr">',
        '<a:tint val="93000"/>',
        '<a:satMod val="150000"/>',
        '<a:shade val="98000"/>',
        '<a:lumMod val="102000"/>',
        '</a:schemeClr>',
        '</a:gs>',
        '<a:gs pos="50000">',
        '<a:schemeClr val="phClr">',
        '<a:tint val="98000"/>',
        '<a:satMod val="130000"/>',
        '<a:shade val="90000"/>',
        '<a:lumMod val="103000"/>',
        '</a:schemeClr>',
        '</a:gs>',
        '<a:gs pos="100000">',
        '<a:schemeClr val="phClr">',
        '<a:shade val="63000"/>',
        '<a:satMod val="120000"/>',
        '</a:schemeClr>',
        '</a:gs>',
        '</a:gsLst>',
        '<a:lin ang="5400000" scaled="0"/>',
        '</a:gradFill>',
        '</a:bgFillStyleLst>',
        '</a:fmtScheme>',
        '</a:themeElements>',
        '<a:objectDefaults/>',
        '<a:extraClrSchemeLst/>',
        '</a:theme>'
    ].join('')
});

/**
 * The workbook element is the top level element. It contains elements and attributes that encompass the
 * data content of the workbook.
 *
 * (CT_Workbook)
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.excel.Workbook', {
    extend: 'Ext.exporter.file.ooxml.XmlRels',
    requires: [
        'Ext.exporter.file.ooxml.excel.Worksheet',
        'Ext.exporter.file.ooxml.excel.Stylesheet',
        'Ext.exporter.file.ooxml.excel.SharedStrings',
        'Ext.exporter.file.ooxml.theme.Office'
    ],
    isWorkbook: true,
    currentSheetIndex: 1,
    currentPivotCacheIndex: 0,
    config: {
        /**
         * @cfg {Ext.exporter.file.ooxml.excel.Stylesheet} stylesheet
         *
         * This is the root element of the Styles part.
         */
        stylesheet: {},
        /**
         * @cfg {Ext.exporter.file.ooxml.excel.SharedStrings} sharedStrings
         *
         * A workbook can contain thousands of cells containing string (non-numeric) data.
         * Furthermore this data is very likely to be repeated across many rows or columns.
         * The goal of implementing a single string table that is shared across the workbook is
         * to improve performance in opening and saving the file by only reading and writing the
         * repetitive information once.
         */
        sharedStrings: {},
        /**
         * @cfg {Ext.exporter.file.ooxml.excel.Sheet[]} sheets
         *
         * This element represents the collection of sheets in the workbook. There are different
         * types of sheets you can create in SpreadsheetML. The most common sheet type is a worksheet;
         * also called a spreadsheet. A worksheet is the primary document that you use in SpreadsheetML
         * to store and work with data. A worksheet consists of cells that are organized into columns and rows.
         */
        sheets: [],
        /**
         * @cfg {Ext.exporter.file.ooxml.excel.PivotCache[]} pivotCaches
         *
         * This element enumerates pivot cache definition parts used by pivot tables and formulas in this workbook.
         */
        pivotCaches: null,
        /**
         * @cfg {Ext.exporter.file.ooxml.theme.Base} theme
         *
         * The theme used by this workbook
         */
        theme: {
            type: 'office',
            folder: '/xl/theme/',
            index: 1
        }
    },
    contentType: {
        contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml'
    },
    relationship: {
        schema: 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument'
    },
    folder: '/xl/',
    fileName: 'workbook',
    tpl: [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ',
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">',
        '<tpl if="sheets">',
        '<sheets>',
        '<tpl if="sheets"><tpl for="sheets.items"><sheet name="{[values.getName()]}" sheetId="{[xindex]}" state="visible" r:id="{[values.getRelationship().getId()]}"/></tpl></tpl>',
        '</sheets>',
        '</tpl>',
        '<tpl if="pivotCaches">',
        '<pivotCaches>',
        '<tpl for="pivotCaches.getRange()">{[values.render()]}</tpl>',
        '</pivotCaches>',
        '</tpl>',
        '</workbook>'
    ],
    destroy: function() {
        var me = this;
        me.setStylesheet(null);
        me.setSharedStrings(null);
        me.setTheme(null);
        me.callParent();
    },
    collectFiles: function(files) {
        var me = this,
            style = me._stylesheet,
            strings = me._sharedStrings,
            theme = me._theme,
            ws, i, length;
        ws = me._sheets;
        length = ws.length;
        for (i = 0; i < length; i++) {
            ws.items[i].collectFiles(files);
        }
        files[me._path] = me.render();
        files[style._path] = style.render();
        files[strings._path] = strings.render();
        files[theme._path] = theme.render();
        me.collectRelationshipsFiles(files);
    },
    collectContentTypes: function(types) {
        var me = this,
            ws, i, length;
        types.push(me.getStylesheet().getContentType());
        types.push(me.getSharedStrings().getContentType());
        types.push(me.getTheme().getContentType());
        ws = me.getSheets();
        length = ws.length;
        for (i = 0; i < length; i++) {
            ws.getAt(i).collectContentTypes(types);
        }
        me.callParent([
            types
        ]);
    },
    applyStylesheet: function(data) {
        if (!data || data.isStylesheet) {
            return data;
        }
        return new Ext.exporter.file.ooxml.excel.Stylesheet();
    },
    updateStylesheet: function(data, oldData) {
        var rels = this.getRelationships();
        if (oldData && rels) {
            rels.removeRelationship(oldData.getRelationship());
        }
        if (data && rels) {
            rels.addRelationship(data.getRelationship());
        }
        Ext.destroy(oldData);
    },
    applySharedStrings: function(data) {
        if (!data || data.isSharedStrings) {
            return data;
        }
        return new Ext.exporter.file.ooxml.excel.SharedStrings();
    },
    updateSharedStrings: function(data, oldData) {
        var rels = this.getRelationships();
        if (oldData && rels) {
            rels.removeRelationship(oldData.getRelationship());
        }
        if (data) {
            rels.addRelationship(data.getRelationship());
        }
        Ext.destroy(oldData);
    },
    applyPivotCaches: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.file.ooxml.excel.PivotCache');
    },
    updatePivotCaches: function(collection, oldCollection) {
        var me = this;
        if (oldCollection) {
            oldCollection.un({
                add: me.onPivotCacheAdd,
                scope: me
            });
        }
        if (collection) {
            collection.on({
                add: me.onPivotCacheAdd,
                scope: me
            });
        }
    },
    onPivotCacheAdd: function(collection, details) {
        var length = details.items.length,
            i, item;
        for (i = 0; i < length; i++) {
            item = details.items[i];
            item.setCacheId(this.currentPivotCacheIndex++);
        }
    },
    applySheets: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.file.ooxml.excel.Sheet');
    },
    updateSheets: function(collection, oldCollection) {
        var me = this;
        if (oldCollection) {
            oldCollection.un({
                add: me.onSheetAdd,
                remove: me.onSheetRemove,
                scope: me
            });
        }
        if (collection) {
            collection.on({
                add: me.onSheetAdd,
                remove: me.onSheetRemove,
                scope: me
            });
        }
    },
    applyTheme: function(value) {
        var cfg = {
                type: 'office'
            };
        if (value) {
            if (typeof value == 'string') {
                cfg.type = value;
            } else {
                Ext.apply(cfg, value);
            }
            value = Ext.Factory.ooxmltheme(value);
        }
        return value;
    },
    updateTheme: function(data, oldData) {
        var rels = this.getRelationships();
        if (oldData && rels) {
            rels.removeRelationship(oldData.getRelationship());
        }
        if (data && rels) {
            rels.addRelationship(data.getRelationship());
        }
        Ext.destroy(oldData);
    },
    onSheetAdd: function(collection, details) {
        var rels = this.getRelationships(),
            length = details.items.length,
            i, item;
        for (i = 0; i < length; i++) {
            item = details.items[i];
            item.setIndex(this.currentSheetIndex++);
            item.setWorkbook(this);
            rels.addRelationship(item.getRelationship());
        }
    },
    onSheetRemove: function(collection, details) {
        var rels = this.getRelationships(),
            length = details.items.length,
            i, item;
        for (i = 0; i < length; i++) {
            item = details.items[i];
            rels.removeRelationship(item.getRelationship());
            Ext.destroy(item);
        }
    },
    /**
     * Convenience method to add worksheets.
     * @param {Object/Array} config
     * @return {Ext.exporter.file.ooxml.excel.Worksheet/Ext.exporter.file.ooxml.excel.Worksheet[]}
     */
    addWorksheet: function(config) {
        var ws = Ext.Array.from(config || {}),
            length = ws.length,
            i, w;
        for (i = 0; i < length; i++) {
            w = ws[i];
            if (w && !w.isWorksheet) {
                w.workbook = this;
                ws[i] = new Ext.exporter.file.ooxml.excel.Worksheet(w);
            }
        }
        return this.getSheets().add(ws);
    },
    /**
     * Convenience method to remove worksheets.
     * @param {Object/Array} config
     * @return {Ext.exporter.file.ooxml.excel.Worksheet/Ext.exporter.file.ooxml.excel.Worksheet[]}
     */
    removeWorksheet: function(config) {
        return this.getSheets().remove(config);
    },
    /**
     * Convenience method to add pivot caches.
     * @param {Object/Array} config
     * @return {Ext.exporter.file.ooxml.excel.PivotCache/Ext.exporter.file.ooxml.excel.PivotCache[]}
     */
    addPivotCache: function(config) {
        if (!this.getPivotCaches()) {
            this.setPivotCaches([]);
        }
        return this.getPivotCaches().add(config || {});
    },
    /**
     * Convenience method to remove pivot caches.
     * @param {Object/Array} config
     * @return {Ext.exporter.file.ooxml.excel.PivotCache/Ext.exporter.file.ooxml.excel.PivotCache[]}
     */
    removePivotCache: function(config) {
        return this.getPivotCaches().remove(config);
    },
    /**
     * Convenience method to add a style.
     *
     * @param {Ext.exporter.file.Style} config
     * @return {Number} Index of the cell style
     */
    addStyle: function(config) {
        return this.getStylesheet().addStyle(config);
    },
    /**
     * Convenience method to add a style.
     *
     * @param {Ext.exporter.file.Style} config
     * @return {Number} Index of the cell style
     */
    addCellStyle: function(config) {
        return this.getStylesheet().addCellStyle(config);
    }
});

/**
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.ContentTypes', {
    extend: 'Ext.exporter.file.ooxml.Xml',
    requires: [
        'Ext.exporter.file.ooxml.ContentType'
    ],
    isContentTypes: true,
    config: {
        contentTypes: [
            {
                tag: 'Default',
                contentType: 'application/vnd.openxmlformats-package.relationships+xml',
                extension: 'rels'
            },
            {
                tag: 'Default',
                contentType: 'application/xml',
                extension: 'xml'
            }
        ]
    },
    tpl: [
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>',
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">',
        '<tpl if="contentTypes"><tpl for="contentTypes.getRange()">{[values.render()]}</tpl></tpl>',
        '</Types>'
    ],
    folder: '/',
    fileName: '[Content_Types]',
    applyContentTypes: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.file.ooxml.ContentType');
    },
    addContentType: function(config) {
        return this.getContentTypes().add(config || {});
    }
});

/**
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.CoreProperties', {
    extend: 'Ext.exporter.file.ooxml.Xml',
    isCoreProperties: true,
    config: {
        /**
         * @cfg {String} [title="Workbook"]
         *
         * The name given to the resource.
         */
        title: "Workbook",
        /**
         * @cfg {String} [author="Sencha"]
         *
         * An entity primarily responsible for making the content of the resource.
         */
        author: 'Sencha',
        /**
         * @cfg {String} [subject=""]
         *
         * The topic of the content of the resource.
         */
        subject: ''
    },
    contentType: {
        contentType: 'application/vnd.openxmlformats-package.core-properties+xml',
        partName: '/docProps/core.xml'
    },
    relationship: {
        schema: 'http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties',
        target: 'docProps/core.xml'
    },
    path: '/docProps/core.xml',
    tpl: [
        '<coreProperties xmlns="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" ',
        'xmlns:dcterms="http://purl.org/dc/terms/" ',
        'xmlns:dc="http://purl.org/dc/elements/1.1/" ',
        'xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">',
        '   <dc:creator>{author}</dc:creator>',
        '   <dc:title>{title}</dc:title>',
        '   <dc:subject>{subject}</dc:subject>',
        '</coreProperties>'
    ]
});

/**
 * An Office Open XML SpreasheetML implementation according to the [ISO/IEC 29500-1:2012][1].
 *
 * [1]: http://www.iso.org/iso/home/store/catalogue_ics/catalogue_detail_ics.htm?csnumber=61750
 *
 * Only a small subset of that standard is implemented.
 *
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.Excel', {
    extend: 'Ext.exporter.file.ooxml.XmlRels',
    requires: [
        'Ext.exporter.file.zip.Archive',
        'Ext.exporter.file.ooxml.excel.Workbook',
        'Ext.exporter.file.ooxml.Relationships',
        'Ext.exporter.file.ooxml.ContentTypes',
        'Ext.exporter.file.ooxml.CoreProperties'
    ],
    config: {
        /**
         * @cfg {Ext.exporter.file.ooxml.CoreProperties} [properties]
         *
         * Core properties of the Excel file
         */
        properties: null,
        /**
         * @cfg {Ext.exporter.file.ooxml.Workbook} workbook
         *
         * At least one Workbook needs to be in the file
         */
        workbook: {}
    },
    folder: '/',
    fileName: null,
    tpl: [],
    constructor: function(config) {
        var ret = this.callParent([
                config
            ]);
        if (!this.getWorkbook()) {
            this.setWorkbook({});
        }
        return ret;
    },
    destroy: function() {
        var me = this;
        me.setWorkbook(null);
        me.setProperties(null);
        me.setRelationships(null);
        me.callParent();
    },
    render: function() {
        var files = {},
            paths, path, content, i, len, zip;
        this.collectFiles(files);
        // zip all files and return the zip content
        paths = Ext.Object.getKeys(files);
        len = paths.length;
        if (!len) {
            return;
        }
        zip = new Ext.exporter.file.zip.Archive();
        for (i = 0; i < len; i++) {
            path = paths[i];
            content = files[path];
            path = path.substr(1);
            if (path.indexOf('.xml') !== -1 || path.indexOf('.rel') !== -1) {
                zip.addFile({
                    path: path,
                    data: content
                });
            }
        }
        content = zip.getContent();
        zip = Ext.destroy(zip);
        return content;
    },
    collectFiles: function(files) {
        var contentTypes = new Ext.exporter.file.ooxml.ContentTypes(),
            wb = this.getWorkbook(),
            props = this.getProperties(),
            types = [];
        wb.collectFiles(files);
        if (props) {
            contentTypes.addContentType(props.getContentType());
            files[props.getPath()] = props.render();
        }
        wb.collectContentTypes(types);
        contentTypes.addContentType(types);
        files[contentTypes.getPath()] = contentTypes.render();
        Ext.destroy(contentTypes);
        this.collectRelationshipsFiles(files);
    },
    applyProperties: function(data) {
        if (!data || data.isCoreProperties) {
            return data;
        }
        return new Ext.exporter.file.ooxml.CoreProperties(data);
    },
    updateProperties: function(data, oldData) {
        var rels = this.getRelationships();
        if (oldData) {
            rels.removeRelationship(oldData.getRelationship());
            oldData.destroy();
        }
        if (data) {
            rels.addRelationship(data.getRelationship());
        }
    },
    applyWorkbook: function(data) {
        if (!data || data.isWorkbook) {
            return data;
        }
        return new Ext.exporter.file.ooxml.excel.Workbook(data);
    },
    updateWorkbook: function(data, oldData) {
        var rels = this.getRelationships();
        if (oldData) {
            rels.removeRelationship(oldData.getRelationship());
            oldData.destroy();
        }
        if (data) {
            rels.addRelationship(data.getRelationship());
        }
    },
    /**
     * Convenience method to add worksheets.
     *
     * @param {Object/Array} config
     * @return {Ext.exporter.file.ooxml.excel.Worksheet/Ext.exporter.file.ooxml.excel.Worksheet[]}
     */
    addWorksheet: function(config) {
        return this.getWorkbook().addWorksheet(config);
    },
    /**
     * Convenience method to add a style.
     *
     * @param {Ext.exporter.file.Style} config
     * @return {Number} Index of the cell style
     */
    addStyle: function(config) {
        return this.getWorkbook().getStylesheet().addStyle(config);
    },
    /**
     * Convenience method to add a style.
     *
     * @param {Ext.exporter.file.Style} config
     * @return {Number} Index of the cell style
     */
    addCellStyle: function(config) {
        return this.getWorkbook().getStylesheet().addCellStyle(config);
    }
});

/**
 * This exporter produces Microsoft Excel 2007 xlsx files for the supplied data. The standard [ISO/IEC 29500-1:2012][1]
 * was used for this implementation.
 *
 * [1]: http://www.iso.org/iso/home/store/catalogue_ics/catalogue_detail_ics.htm?csnumber=61750
 */
Ext.define('Ext.exporter.excel.Xlsx', {
    extend: 'Ext.exporter.Base',
    // for backward compatibility
    alternateClassName: 'Ext.exporter.Excel',
    alias: [
        'exporter.excel07',
        'exporter.xlsx',
        // last version of excel supported will get this alias
        'exporter.excel'
    ],
    requires: [
        'Ext.exporter.file.ooxml.Excel'
    ],
    config: {
        /**
         * @cfg {Ext.exporter.file.excel.Style} defaultStyle
         *
         * Default style applied to all cells
         */
        defaultStyle: {
            alignment: {
                vertical: 'Top'
            },
            font: {
                fontName: 'Arial',
                family: 'Swiss',
                size: 11,
                color: '#000000'
            }
        },
        /**
         * @cfg {Ext.exporter.file.excel.Style} titleStyle
         *
         * Default style applied to the title
         */
        titleStyle: {
            alignment: {
                horizontal: 'Center',
                vertical: 'Center'
            },
            font: {
                fontName: 'Arial',
                family: 'Swiss',
                size: 18,
                color: '#1F497D'
            }
        },
        /**
         * @cfg {Ext.exporter.file.excel.Style} groupHeaderStyle
         *
         * Default style applied to the group headers
         */
        groupHeaderStyle: {
            borders: [
                {
                    position: 'Bottom',
                    lineStyle: 'Continuous',
                    weight: 1,
                    color: '#4F81BD'
                }
            ]
        },
        /**
         * @cfg {Ext.exporter.file.excel.Style} groupFooterStyle
         *
         * Default style applied to the group footers
         */
        groupFooterStyle: {
            borders: [
                {
                    position: 'Top',
                    lineStyle: 'Continuous',
                    weight: 1,
                    color: '#4F81BD'
                }
            ]
        },
        /**
         * @cfg {Ext.exporter.file.excel.Style} tableHeaderStyle
         *
         * Default style applied to the table headers
         */
        tableHeaderStyle: {
            alignment: {
                horizontal: 'Center',
                vertical: 'Center'
            },
            borders: [
                {
                    position: 'Bottom',
                    lineStyle: 'Continuous',
                    weight: 1,
                    color: '#4F81BD'
                }
            ],
            font: {
                fontName: 'Arial',
                family: 'Swiss',
                size: 11,
                color: '#1F497D'
            }
        }
    },
    fileName: 'export.xlsx',
    charset: 'ascii',
    mimeType: 'application/zip',
    binary: true,
    titleRowHeight: 22.5,
    headerRowHeight: 20.25,
    destroy: function() {
        var me = this;
        me.excel = me.worksheet = Ext.destroy(me.excel, me.worksheet);
        me.callParent();
    },
    getContent: function() {
        var me = this,
            config = this.getConfig(),
            data = config.data,
            colMerge, ws;
        me.excel = new Ext.exporter.file.ooxml.Excel({
            properties: {
                title: config.title,
                author: config.author
            }
        });
        me.worksheet = ws = me.excel.addWorksheet({
            name: config.title
        });
        me.tableHeaderStyleId = me.excel.addCellStyle(config.tableHeaderStyle);
        colMerge = data ? data.getColumnCount() : 1;
        ws.beginRowRendering();
        me.addTitle(config, colMerge);
        if (data) {
            ws.renderRows(me.buildHeader());
            ws.renderRows(me.buildRows(data._groups, colMerge, 0));
        }
        ws.endRowRendering();
        me.columnStylesNormal = me.columnStylesNormalId = me.columnStylesFooter = me.columnStylesFooterId = null;
        return me.excel.render();
    },
    addTitle: function(config, colMerge) {
        if (!Ext.isEmpty(config.title)) {
            this.worksheet.renderRow({
                height: this.titleRowHeight,
                cells: [
                    {
                        mergeAcross: colMerge - 1,
                        value: config.title,
                        styleId: this.excel.addCellStyle(config.titleStyle)
                    }
                ]
            });
        }
    },
    buildRows: function(groups, colMerge, level) {
        var me = this,
            showSummary = me._showSummary,
            rows = [],
            g, row, styleH, styleF, cells, i, j, k, gLen, sLen, cLen, oneLine, text, items, cell, temp;
        if (!groups) {
            return rows;
        }
        styleH = me.excel.addCellStyle(Ext.applyIf({
            alignment: {
                Indent: level > 0 ? level : 0
            }
        }, me._groupHeaderStyle));
        styleF = me.excel.addCellStyle(Ext.applyIf({
            alignment: {
                Indent: level > 0 ? level : 0
            }
        }, me.columnStylesFooter[0]));
        gLen = groups.length;
        for (i = 0; i < gLen; i++) {
            g = groups.items[i];
            text = g._text;
            // if the group has no subgroups and no rows then show only summaries
            oneLine = (!g._groups && !g._rows);
            if (showSummary !== false && !Ext.isEmpty(text) && !oneLine) {
                rows.push({
                    styleId: styleH,
                    cells: [
                        {
                            mergeAcross: colMerge - 1,
                            value: text,
                            styleId: styleH
                        }
                    ]
                });
            }
            if (g._groups) {
                Ext.Array.insert(rows, rows.length, me.buildRows(g._groups, colMerge, level + 1));
            }
            if (g._rows) {
                items = g._rows.items;
                sLen = items.length;
                for (k = 0; k < sLen; k++) {
                    temp = items[k];
                    row = {
                        id: temp._id,
                        cells: []
                    };
                    cells = temp._cells;
                    cLen = cells.length;
                    for (j = 0; j < cLen; j++) {
                        cell = cells.items[j];
                        row.cells.push({
                            id: cell._id,
                            value: cell._value,
                            styleId: this.columnStylesNormalId[j]
                        });
                    }
                    rows.push(row);
                }
            }
            items = g._summaries && g._summaries.items;
            if (items && (showSummary || oneLine)) {
                sLen = items.length;
                for (k = 0; k < sLen; k++) {
                    // that's the summary footer
                    temp = items[k];
                    row = {
                        id: temp._id,
                        cells: []
                    };
                    cells = temp._cells;
                    cLen = cells.length;
                    for (j = 0; j < cLen; j++) {
                        cell = cells.items[j];
                        row.cells.push({
                            id: cell._id,
                            value: cell._value,
                            styleId: (oneLine ? me.columnStylesNormalId[j] : (j === 0 ? styleF : me.columnStylesFooterId[j]))
                        });
                    }
                    rows.push(row);
                }
            }
            g.destroy();
        }
        return rows;
    },
    buildHeader: function() {
        var me = this,
            ret = {},
            data = me.getData(),
            rows = [],
            keys, row, i, j, len, lenCells, style, arr, fStyle, col, colCfg, cell;
        me.buildHeaderRows(data.getColumns(), ret);
        keys = Ext.Object.getKeys(ret);
        len = keys.length;
        for (i = 0; i < len; i++) {
            row = {
                height: me.headerRowHeight,
                styleId: me.tableHeaderStyleId,
                cells: []
            };
            arr = ret[keys[i]];
            lenCells = arr.length;
            for (j = 0; j < lenCells; j++) {
                cell = arr[j];
                cell.styleId = me.tableHeaderStyleId;
                row.cells.push(cell);
            }
            rows.push(row);
        }
        arr = data.getBottomColumns();
        lenCells = arr.length;
        me.columnStylesNormal = [];
        me.columnStylesNormalId = [];
        me.columnStylesFooter = [];
        me.columnStylesFooterId = [];
        fStyle = me.getGroupFooterStyle();
        for (j = 0; j < lenCells; j++) {
            col = arr[j];
            colCfg = {
                style: col.getStyle(),
                width: col.getWidth()
            };
            style = Ext.applyIf({
                parentId: 0
            }, fStyle);
            style = Ext.merge(style, colCfg.style);
            me.columnStylesFooter.push(style);
            me.columnStylesFooterId.push(me.excel.addCellStyle(style));
            style = Ext.applyIf({
                parentId: 0
            }, colCfg.style);
            me.columnStylesNormal.push(style);
            colCfg.styleId = me.excel.addCellStyle(style);
            me.columnStylesNormalId.push(colCfg.styleId);
            colCfg.min = colCfg.max = j + 1;
            colCfg.style = null;
            if (colCfg.width) {
                colCfg.width = colCfg.width / 10;
            }
            me.worksheet.addColumn(colCfg);
        }
        return rows;
    },
    buildHeaderRows: function(columns, result) {
        var col, cols, i, len, name;
        if (!columns) {
            return;
        }
        len = columns.length;
        for (i = 0; i < len; i++) {
            col = columns.items[i].getConfig();
            col.value = col.text;
            cols = col.columns;
            delete (col.columns);
            delete (col.table);
            name = 's' + col.level;
            result[name] = result[name] || [];
            result[name].push(col);
            this.buildHeaderRows(cols, result);
        }
    }
});

/**
 * This is the base class for an exporter plugin. It is extended by the exporter plugins
 * for grid panel and pivot grid.
 *
 * This could be used to create a plugin that allows a component to export tabular data.
 *
 * @private
 */
Ext.define('Ext.exporter.Plugin', {
    extend: 'Ext.plugin.Abstract',
    alias: [
        'plugin.exporterplugin'
    ],
    requires: [
        'Ext.exporter.data.Table',
        'Ext.exporter.Excel'
    ],
    /**
     * @event beforedocumentsave
     * Fires on the component before a document is exported and saved.
     * @param {Ext.Component} component Reference to the component that uses this plugin
     * @param {Object} params Additional parameters sent with this event
     * @param {Object} params.config The config object used in the {@link #saveDocumentAs} method
     * @param {Ext.exporter.Base} params.exporter A reference to the exporter object used to save the document
     */
    /**
     * @event documentsave
     * Fires on the component whenever a document is exported and saved.
     * @param {Ext.Component} component Reference to the component that uses this plugin
     * @param {Object} params Additional parameters sent with this event
     * @param {Object} params.config The config object used in the {@link #saveDocumentAs} method
     * @param {Ext.exporter.Base} params.exporter A reference to the exporter object used to save the document
     */
    /**
     * @event dataready
     * Fires on the component when the {@link Ext.exporter.data.Table data} is ready.
     * You could adjust styles or data before the document is generated and saved.
     * @param {Ext.Component} component Reference to the component that uses this plugin
     * @param {Object} params Additional parameters sent with this event
     * @param {Object} params.config The config object used in the {@link #saveDocumentAs} method
     * @param {Ext.exporter.Base} params.exporter A reference to the exporter object used to save the document
     */
    /**
     * Plugin initialization
     *
     * @param cmp
     * @return {Ext.exporter.Plugin}
     * @private
     */
    init: function(cmp) {
        var me = this;
        cmp.saveDocumentAs = Ext.bind(me.saveDocumentAs, me);
        cmp.getDocumentData = Ext.bind(me.getDocumentData, me);
        me.cmp = cmp;
        return me.callParent([
            cmp
        ]);
    },
    destroy: function() {
        var me = this;
        if (this.delayedSaveTimer) {
            clearTimeout(this.delayedSaveTimer);
        }
        me.cmp.saveDocumentAs = me.cmp.getDocumentData = me.cmp = null;
        me.callParent();
    },
    /**
     * Save the export file. This method is added to the component as "saveDocumentAs".
     *
     * Pass in exporter specific configs to the config parameter.
     *
     * @param {Ext.exporter.Base} config Config object used to initialize the proper exporter
     * @param {String} config.type Type of the exporter as defined in the exporter alias. Default is `excel`.
     * @param {String} [config.title] Title added to the export document
     * @param {String} [config.author] Who exported the document?
     * @param {String} [config.fileName] Name of the exported file, including the extension
     * @param {String} [config.charset] Exported file's charset
     *
     * @return {Ext.promise.Promise}
     *
     */
    saveDocumentAs: function(config) {
        var cmp = this.cmp,
            deferred = new Ext.Deferred(),
            exporter = this.getExporter(config);
        cmp.fireEvent('beforedocumentsave', cmp, {
            config: config,
            exporter: exporter
        });
        this.delayedSaveTimer = Ext.asap(this.delayedSave, this, [
            exporter,
            config,
            deferred
        ]);
        return deferred.promise;
    },
    /**
     * Delayed function that exports the document
     *
     * @param exporter
     * @param config
     * @param deferred
     *
     * @private
     */
    delayedSave: function(exporter, config, deferred) {
        var cmp = this.cmp;
        // the plugin might be disabled or the component is already destroyed
        if (this.disabled || !cmp) {
            Ext.destroy(exporter);
            deferred.reject();
            return;
        }
        this.setExporterData(exporter, config);
        exporter.saveAs().then(function() {
            deferred.resolve(config);
        }, function(msg) {
            deferred.reject(msg);
        }).always(function() {
            if (cmp && !cmp.destroyed) {
                cmp.fireEvent('documentsave', cmp, {
                    config: config,
                    exporter: exporter
                });
            }
            Ext.destroy(exporter);
        });
    },
    /**
     * Fetch the export data. This method is added to the component as "getDocumentData".
     *
     * Pass in exporter specific configs to the config parameter.
     *
     * @param {Ext.exporter.Base} config Config object used to initialize the proper exporter
     * @param {String} [config.type] Type of the exporter as defined in the exporter alias. Default is `excel`.
     * @param {String} [config.title] Title added to the export document
     * @param {String} [config.author] Who exported the document?
     * @return {String}
     *
     */
    getDocumentData: function(config) {
        var exporter, ret;
        if (this.disabled) {
            return;
        }
        exporter = this.getExporter(config);
        this.setExporterData(exporter, config);
        ret = exporter.getContent();
        Ext.destroy(exporter);
        return ret;
    },
    /**
     * Builds the exporter object and returns it.
     *
     * @param {Object} config
     * @return {Ext.exporter.Base}
     *
     * @private
     */
    getExporter: function(config) {
        var cfg = Ext.apply({
                type: 'excel'
            }, config);
        return Ext.Factory.exporter(cfg);
    },
    /**
     *
     * @param exporter
     * @param config
     * @private
     */
    setExporterData: function(exporter, config) {
        var cmp = this.cmp;
        exporter.setData(this.prepareData(config));
        cmp.fireEvent('dataready', cmp, {
            config: config,
            exporter: exporter
        });
    },
    /**
     *
     * @param {Object/Array} style
     * @param {Object} config Configuration passed to saveDocumentAs and getDocumentData methods
     * @return {Object}
     */
    getExportStyle: function(style, config) {
        var type = (config && config.type),
            types, def, index;
        if (Ext.isArray(style)) {
            types = Ext.Array.pluck(style, 'type');
            index = Ext.Array.indexOf(types, undefined);
            if (index >= 0) {
                // we found a default style which means that all others are exceptions
                def = style[index];
            }
            index = Ext.Array.indexOf(types, type);
            return index >= 0 ? style[index] : def;
        } else {
            return style;
        }
    },
    /**
     * This method creates the data object that will be consumed by the exporter.
     * @param {Object} config The config object passed to the getDocumentData and saveDocumentAs methods
     * @return {Ext.exporter.data.Table}
     *
     * @private
     */
    prepareData: Ext.emptyFn
});

/**
 * This class is used to create an xml Excel Worksheet
 */
Ext.define('Ext.exporter.file.excel.Worksheet', {
    extend: 'Ext.exporter.file.Base',
    config: {
        /**
         * @cfg {String} name (required)
         *
         * This value must be unique within the list of sheet names in the workbook. Sheet names must conform to
         * the legal names of Excel sheets and, thus, cannot contain /, \, ?, *, [, ] and are limited to 31 chars.
         */
        name: 'Sheet',
        /**
         * @cfg {Boolean} protection
         *
         * This attribute indicates whether or not the worksheet is protected. When the worksheet is
         * not protected, cell-level protection has no effect.
         */
        protection: null,
        /**
         * @cfg {Boolean} rightToLeft
         *
         * If this attribute is `true`, the window displays from right to left, but if this element is not
         * specified (or `false`), the window displays from left to right. The Spreadsheet component does not
         * support this attribute.
         */
        rightToLeft: null,
        /**
         * @cfg {Boolean} [showGridLines=true]
         *
         * Should grid lines be visible in this spreadsheet?
         */
        showGridLines: true,
        /**
         * @cfg {Ext.exporter.file.excel.Table[]} tables
         *
         * Collection of tables available in this worksheet
         */
        tables: []
    },
    /**
     * @method getTables
     * @return {Ext.util.Collection}
     *
     * Returns the collection of tables available in this worksheet
     */
    tpl: [
        '   <Worksheet ss:Name="{name:htmlEncode}"',
        '<tpl if="this.exists(protection)"> ss:Protected="{protection:this.toNumber}"</tpl>',
        '<tpl if="this.exists(rightToLeft)"> ss:RightToLeft="{rightToLeft:this.toNumber}"</tpl>',
        '>\n',
        '<tpl if="tables"><tpl for="tables.getRange()">{[values.render()]}</tpl></tpl>',
        '       <WorksheetOptions xmlns="urn:schemas-microsoft-com:office:excel">\n',
        '          <PageSetup>\n',
        '              <Layout x:CenterHorizontal="1" x:Orientation="Portrait" />\n',
        '              <Header x:Margin="0.3" />\n',
        '              <Footer x:Margin="0.3" x:Data="Page &amp;P of &amp;N" />\n',
        '              <PageMargins x:Bottom="0.75" x:Left="0.7" x:Right="0.7" x:Top="0.75" />\n',
        '          </PageSetup>\n',
        '          <FitToPage />\n',
        '          <Print>\n',
        '              <PrintErrors>Blank</PrintErrors>\n',
        '              <FitWidth>1</FitWidth>\n',
        '              <FitHeight>32767</FitHeight>\n',
        '              <ValidPrinterInfo />\n',
        '              <VerticalResolution>600</VerticalResolution>\n',
        '          </Print>\n',
        '          <Selected />\n',
        '<tpl if="!showGridLines">',
        '          <DoNotDisplayGridlines />\n',
        '</tpl>',
        '          <ProtectObjects>False</ProtectObjects>\n',
        '          <ProtectScenarios>False</ProtectScenarios>\n',
        '      </WorksheetOptions>\n',
        '   </Worksheet>\n',
        {
            exists: function(value) {
                return !Ext.isEmpty(value);
            },
            toNumber: function(value) {
                return Number(Boolean(value));
            }
        }
    ],
    destroy: function() {
        this.setTables(null);
        this.callParent();
    },
    applyTables: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.file.excel.Table');
    },
    /**
     * Convenience method to add tables. You can also use workbook.getTables().add(config).
     * @param {Object/Array} config
     * @return {Ext.exporter.file.excel.Table/Ext.exporter.file.excel.Table[]}
     */
    addTable: function(config) {
        return this.getTables().add(config || {});
    },
    /**
     * Convenience method to fetch a table by its id.
     * @param id
     * @return {Ext.exporter.file.excel.Table}
     */
    getTable: function(id) {
        return this.getTables().get(id);
    },
    applyName: function(value) {
        // Excel limits the worksheet name to 31 chars
        return Ext.String.ellipsis(String(value), 31);
    }
});

/**
 * This class is used to create an xml Excel Table
 */
Ext.define('Ext.exporter.file.excel.Table', {
    extend: 'Ext.exporter.file.Base',
    config: {
        /**
         * This attribute specifies the total number of columns in this table. If specified, this attribute
         * must be in sync with the table. Columns indices in the table should begin at 1 and go to
         * ExpandedColumnCount. If this value is out-of-sync with the table, the specified XML Spreadsheet
         * document is invalid.
         *
         * @private
         */
        expandedColumnCount: null,
        /**
         * Specifies the total number of rows in this table without regard for sparseness. This attribute defines
         * the overall size of the table, if the specified rows and columns were expanded to full size.
         * If specified, this attribute must be in sync with the table. Row indices in the table should begin
         * at 1 and go to ExpandedRowCount. If this value is out-of-sync with the table, the specified XML
         * Spreadsheet document is invalid.
         *
         * @private
         */
        expandedRowCount: null,
        /**
         * WebCalc will set x:FullColumns to 1 when the data in the table represents full columns of data.
         * Excel will save x:FullColumns to 1 if the Table extends the full height. This attribute is ignored
         * on file load, but on XML Spreadsheet paste it is taken to indicate that the source clip has full columns.
         *
         * @private
         */
        fullColumns: 1,
        /**
         * WebCalc will set x:FullRows to 1 when the data in the table represents full rows of data. Excel will
         * save x:FullRows to 1 if the Table extends the full width. This attribute is ignored on file load, but on
         * XML Spreadsheet paste it is taken to indicate that the source clip has full rows.
         *
         * @private
         */
        fullRows: 1,
        /**
         * @cfg {Number} [defaultColumnWidth=48]
         *
         * Specifies the default width of columns in this table. This attribute is specified in points.
         */
        defaultColumnWidth: 48,
        /**
         * @cfg {Number} [defaultRowHeight=12.75]
         *
         * Specifies the default height of rows in this table. This attribute is specified in points.
         */
        defaultRowHeight: 12.75,
        /**
         * @cfg {String} styleId
         *
         * Excel style attached to this table
         */
        styleId: null,
        /**
         * @cfg {Number} [leftCell=1]
         *
         * Specifies the column index that this table should be placed at. This value must be greater than zero.
         */
        leftCell: 1,
        /**
         * @cfg {Number} [topCell=1]
         *
         * Specifies the row index that this table should be placed at. This value must be greater than zero.
         */
        topCell: 1,
        /**
         * @cfg {Ext.exporter.file.excel.Column[]} columns
         *
         * Collection of column definitions available on this table
         */
        columns: [],
        /**
         * @cfg {Ext.exporter.file.excel.Row[]} rows
         *
         * Collection of row definitions available on this table
         */
        rows: []
    },
    /**
     * @method getColumns
     * @return {Ext.util.Collection}
     *
     * Returns the collection of columns available in this table
     */
    /**
     * @method getRows
     * @return {Ext.util.Collection}
     *
     * Returns the collection of rows available in this table
     */
    tpl: [
        '       <Table x:FullColumns="{fullColumns}" x:FullRows="{fullRows}"',
        '<tpl if="this.exists(expandedRowCount)"> ss:ExpandedRowCount="{expandedRowCount}"</tpl>',
        '<tpl if="this.exists(expandedColumnCount)"> ss:ExpandedColumnCount="{expandedColumnCount}"</tpl>',
        '<tpl if="this.exists(defaultRowHeight)"> ss:DefaultRowHeight="{defaultRowHeight}"</tpl>',
        '<tpl if="this.exists(defaultColumnWidth)"> ss:DefaultColumnWidth="{defaultColumnWidth}"</tpl>',
        '<tpl if="this.exists(leftCell)"> ss:LeftCell="{leftCell}"</tpl>',
        '<tpl if="this.exists(topCell)"> ss:TopCell="{topCell}"</tpl>',
        '<tpl if="this.exists(styleId)"> ss:StyleID="{styleId}"</tpl>',
        '>\n',
        '<tpl if="columns"><tpl for="columns.getRange()">{[values.render()]}</tpl></tpl>',
        '<tpl if="rows">',
        '<tpl for="rows.getRange()">{[values.render()]}</tpl>',
        '<tpl else>         <Row ss:AutoFitHeight="0"/>\n</tpl>',
        '       </Table>\n',
        {
            exists: function(value) {
                return !Ext.isEmpty(value);
            }
        }
    ],
    destroy: function() {
        this.setColumns(null);
        this.setRows(null);
        this.callParent();
    },
    applyColumns: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.file.excel.Column');
    },
    applyRows: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.file.excel.Row');
    },
    /**
     * Convenience method to add columns. You can also use workbook.getColumns().add(config).
     * @param {Object/Array} config
     * @return {Ext.exporter.file.excel.Column/Ext.exporter.file.excel.Column[]}
     */
    addColumn: function(config) {
        return this.getColumns().add(config || {});
    },
    /**
     * Convenience method to fetch a column by its id.
     * @param id
     * @return {Ext.exporter.file.excel.Column}
     */
    getColumn: function(id) {
        return this.getColumns().get(id);
    },
    /**
     * Convenience method to add rows. You can also use workbook.getRows().add(config).
     * @param {Object/Array} config
     * @return {Ext.exporter.file.excel.Row/Ext.exporter.file.excel.Row[]}
     */
    addRow: function(config) {
        return this.getRows().add(config || {});
    },
    /**
     * Convenience method to fetch a row by its id.
     * @param id
     * @return {Ext.exporter.file.excel.Row}
     */
    getRow: function(id) {
        return this.getRows().get(id);
    }
});

/**
 * This class defines a single style in the current workbook. This element is optional,
 * but is required to perform any custom formatting.
 *
 *
 * A style can be either standalone or based on one other style (this is called the parent style), in which case,
 * all base properties are first inherited from the parent, then the properties in the style are treated as overrides.
 * Parent styles must be specified before they are first referenced.
 */
Ext.define('Ext.exporter.file.excel.Style', {
    extend: 'Ext.exporter.file.Style',
    config: {
        /**
         * @cfg {String} id
         * A unique name within this XML document that identifies this style. This string can be any valid
         * identifier and there is no notion of order. The special value of "Default" indicates that this style
         * represents the default formatting for this workbook.
         *
         */
        /**
         * @cfg {String} [parentId]
         *
         * Presence of this element indicates that this style should first inherit it's default formatting settings
         * from the specified parent style. Then, after the parent settings are inherited, we apply the settings in
         * this style as overrides. This attribute refers to a predefined style ID.
         *
         */
        parentId: null,
        /**
         * @cfg {String} [name]
         *
         * This property identifies this style as a named style that was created in Excel using the Style
         * command (Format menu). Duplicate names are illegal.
         *
         */
        /**
         * @cfg {Object} [protection]
         *
         * Defines the protection properties that should be used in cells referencing this style.
         * This element exists as a short-hand way to apply protection to an entire table, row, or column, by simply adding it to a style.
         *
         * Following keys are allowed on this object and are all optional:
         *
         * @cfg {Boolean} protection.protected
         * This attribute indicates whether or not this cell is protected. When the worksheet is
         * unprotected, cell-level protection has no effect. When a cell is protected, it will not allow the user to
         * enter information into it. Defaults to `true`.
         *
         * @cfg {Boolean} protection.hideFormula
         * This attribute indicates whether or not this cell's formula should be hidden when
         * worksheet protection is enabled. Defaults to `false`.
         *
         */
        protection: null
    },
    /**
         * @cfg {Object} [alignment]
         *
         * Following keys are allowed on this object and are all optional:
         *
         * @cfg {String} alignment.horizontal
         * Specifies the left-to-right alignment of text within a cell. The Spreadsheet component
         * does not support `CenterAcrossSelection`, `Fill`, `Justify`, `Distributed`, and `JustifyDistributed`.
         * Possible values: `Automatic`, `Left`, `Center`, `Right`, `Fill`, `Justify`, `CenterAcrossSelection`, `Distributed`,
         * and `JustifyDistributed`. Default is `Automatic`.
         *
         * @cfg {Number} alignment.indent
         * Specifies the number of indents. This attribute is not supported by the Spreadsheet component.
         * Defaults to `0`.
         *
         * @cfg {String} alignment.readingOrder
         * Specifies the default right-to-left text entry mode for a cell. The Spreadsheet component
         * does not support `Context`. Possible values: `RightToLeft`, `LeftToRight`, and `Context`. Defaults to `Context`.
         *
         * @cfg {Number} alignment.rotate
         * Specifies the rotation of the text within the cell. `90` is straight up, `0` is horizontal,
         * and `-90` is straight down. The Spreadsheet component does not support this attribute. Defaults to `0`.
         *
         * @cfg {Boolean} alignment.shrinkToFit
         * `true` means that the text size should be shrunk so that all of the text fits within the cell.
         * `false` means that the font within the cell should behave normally. The Spreadsheet component does not support this attribute.
         * Defaults to `false`.
         *
         * @cfg {String} alignment.vertical
         * Specifies the top-to-bottom alignment of text within a cell. `Distributed` and
         * `JustifyDistributed` are only legitimate values when **VerticalText** is `1`. The Spreadsheet component does
         * not support `Justify`, `Distributed`, or `JustifyDistributed`. Possible values: `Automatic`, `Top`, `Bottom`,
         * `Center`, `Justify`, `Distributed`, and `JustifyDistributed`. Defaults to `Automatic`.
         *
         * @cfg {Boolean} alignment.verticalText
         * `true` specifies whether the text is drawn "downwards", whereby each letter is drawn horizontally,
         * one above the other. The Spreadsheet component does not support this attribute. Defaults to `false`.
         *
         * @cfg {Boolean} alignment.wrapText
         * Specifies whether the text in this cell should wrap at the cell boundary. `false` means that
         * text either spills or gets truncated at the cell boundary (depending on whether the adjacent cell(s) have content).
         * The Spreadsheet component does not support this attribute. Defaults to `false`.
         *
         */
    /**
         * @cfg {Object} [font]
         * Defines the font attributes to use in this style. Each attribute that is specified is
         * considered an override from the default.
         *
         *
         * Following keys are allowed on this object:
         *
         * @cfg {Boolean} font.bold
         * Specifies the bold state of the font. If the parent style has **Bold**: `true` and the child style wants
         * to override the setting, it must explicitly set the value to **Bold**: `false`. If this attribute is not specified
         * within an element, the default is assumed. Defaults to `false`.
         *
         * @cfg {String} font.color
         * Specifies the color of the font. This value can be either a 6-hexadecimal digit number
         * in "#rrggbb" format or it can be any of the Internet Explorer named colors (including the named Windows colors).
         * This string can also be special value of `Automatic`. This string is case insensitive. If this attribute is not
         * specified within an element, the default is assumed. Defaults to `Automatic`.
         *
         * @cfg {String} font.fontName
         * Specifies the name of the font. This string is case insensitive. If this attribute is
         * not specified within an element, the default is assumed. Defaults to `Arial`.
         *
         * @cfg {Boolean} font.italic
         * Similar to `font.bold` in behavior, this attribute specifies the italic state of the font.
         * If this attribute is not specified within an element, the default is assumed. Defaults to `false`.
         *
         * @cfg {Boolean} font.outline
         * Similar to `font.bold` in behavior, this attribute specifies whether the font is rendered as an
         * outline. This property originates in Macintosh Office, and is not used on Windows. If this attribute is not
         * specified within an element, the default is assumed. The Spreadsheet component does not support this attribute.
         * Defaults to `false`.
         *
         * @cfg {Boolean} font.shadow
         * Similar to `font.bold` in behavior, this attribute specifies whether the font is shadowed.
         * This property originates in Macintosh Office, and is not used on Windows. If this attribute is not
         * specified within an element, the default is assumed. The Spreadsheet component does not support this attribute.
         * Defaults to `false`.
         *
         * @cfg {Number} font.size
         * Specifies the size of the font in points. This value must be strictly greater than 0.
         * If this attribute is not specified within an element, the default is assumed. Defaults to `10`.
         *
         * @cfg {Boolean} font.strikeThrough
         * Similar to `font.bold` in behavior, this attribute specifies the strike-through state
         * of the font. If this attribute is not specified within an element, the default is assumed. The Spreadsheet
         * component does not support this attribute. Defaults to `false`.
         *
         * @cfg {String} font.underline
         * Specifies the underline state of the font. If the parent style is something other than
         * None and a child style wants to override the value, it must explicitly reset the value. If this attribute is
         * not specified within an element, the default is assumed. Possible values: `None`, `Single`, `Double`,
         * `SingleAccounting`, and `DoubleAccounting`. Defaults to `None`.
         *
         * @cfg {String} font.verticalAlign
         * This attribute specifies the subscript or superscript state of the font. If this
         * attribute is not specified within an element, the default is assumed. The Spreadsheet component does not
         * support this attribute. Possible values: `None`, `Subscript`, and `Superscript`. Defaults to `None`.
         *
         * @cfg {Number} font.charSet
         * Win32-dependent character set value. Defaults to `0`.
         *
         * @cfg {String} font.family
         * Win32-dependent font family. Possible values: `Automatic`, `Decorative`, `Modern`,
         * `Roman`, `Script`, and `Swiss`. Defaults to `Automatic`.
         *
         */
    /**
         * @cfg {Object} interior Defines the fill properties to use in this style. Each attribute that is specified is
         * considered an override from the default.
         *
         * Following keys are allowed on this object:
         *
         * @cfg {String} interior.color
         * Specifies the fill color of the cell. This value can be either a 6-hexadecimal digit
         * number in "#rrggbb" format or it can be any of the Internet Explorer named colors (including the named
         * Windows colors). This string can also be special value of `Automatic`. This string is case insensitive.
         * If `interior.pattern`: "Solid", this value is the fill color of the cell. Otherwise, the cell is filled with a blend of
         * `interior.color` and `interior.patternColor`, with the `interior.pattern` attribute choosing the appearance.
         *
         * @cfg {String} interior.pattern
         * Specifies the fill pattern in the cell. The fill pattern determines how to blend the
         * `interior.color` and `interior.patternColor` attributes to produce the cell's appearance. The Spreadsheet component does not
         * support this attribute. Possible values: `None`, `Solid`, `Gray75`, `Gray50`, `Gray25`, `Gray125`, `Gray0625`,
         * `HorzStripe`, `VertStripe`, `ReverseDiagStripe`, `DiagStripe`, `DiagCross`, `ThickDiagCross`,
         * `ThinHorzStripe`, `ThinVertStripe`, `ThinReverseDiagStripe`, `ThinDiagStripe`, `ThinHorzCross`, and
         * `ThinDiagCross`. Defaults to `None`.
         *
         * @cfg {String} interior.patternColor
         * Specifies the secondary fill color of the cell when `interior.pattern` does not equal `Solid`.
         * The Spreadsheet component does not support this attribute. Defaults to `Automatic`.
         *
         */
    /**
         * @cfg {String} format
         *
         * A number format code in the Excel number format syntax. This can also be one of the following values:
         * `General`, `General Number`, `General Date`, `Long Date`, `Medium Date`, `Short Date`, `Long Time`, `Medium Time`,
         * `Short Time`, `Currency`, `Euro Currency`, `Fixed`, `Standard`, `Percent`, `Scientific`, `Yes/No`,
         * `True/False`, or `On/Off`. All special values are the same as the HTML number formats, with the exception
         * of `Currency` and `Euro Currency`.
         *
         * `Currency` is the currency format with two decimal places and red text with parenthesis for negative values.
         *
         * `Euro Currency` is the same as `Currency` using the Euro currency symbol instead.
         *
         */
    /**
         * @cfg {Object[]} borders
         *
         * Array of border objects. Following keys are allowed for border objects:
         *
         * @cfg {String} borders.position
         * Specifies which of the six possible borders this element represents. Duplicate
         * borders are not permitted and are considered invalid. The Spreadsheet component does not support
         * `DiagonalLeft` or `DiagonalRight`. Possible values: `Left`, `Top`, `Right`, `Bottom`, `DiagonalLeft`, and
         * `DiagonalRight`
         *
         * @cfg {String} borders.color
         * Specifies the color of this border. This value can be either a 6-hexadecimal digit
         * number in "#rrggbb" format or it can be any of the Microsoft® Internet Explorer named colors
         * (including the named Microsoft Windows® colors). This string can also be the special value of `Automatic`.
         * This string is case insensitive.
         *
         * @cfg {String} borders.lineStyle
         * Specifies the appearance of this border. The Spreadsheet component does
         * not support `SlantDashDot` and `Double`. Possible values: `None`, `Continuous`, `Dash`, `Dot`, `DashDot`,
         * `DashDotDot`, `SlantDashDot`, and `Double`.
         *
         * @cfg {Number} borders.weight
         * Specifies the weight (or thickness) of this border. This measurement is specified in points,
         * and the following values map to Excel: `0`—Hairline, `1`—Thin, `2`—Medium, `3`—Thick.
         *
         */
    checks: {
        alignment: {
            horizontal: [
                'Automatic',
                'Left',
                'Center',
                'Right',
                'Fill',
                'Justify',
                'CenterAcrossSelection',
                'Distributed',
                'JustifyDistributed'
            ],
            //ReadingOrder: ['LeftToRight', 'RightToLeft', 'Context'],
            shrinkToFit: [
                true,
                false
            ],
            vertical: [
                'Automatic',
                'Top',
                'Bottom',
                'Center',
                'Justify',
                'Distributed',
                'JustifyDistributed'
            ],
            verticalText: [
                true,
                false
            ],
            wrapText: [
                true,
                false
            ]
        },
        font: {
            family: [
                'Automatic',
                'Decorative',
                'Modern',
                'Roman',
                'Script',
                'Swiss'
            ],
            outline: [
                true,
                false
            ],
            shadow: [
                true,
                false
            ],
            underline: [
                'None',
                'Single',
                'Double',
                'SingleAccounting',
                'DoubleAccounting'
            ],
            verticalAlign: [
                'None',
                'Subscript',
                'Superscript'
            ]
        },
        border: {
            position: [
                'Left',
                'Top',
                'Right',
                'Bottom',
                'DiagonalLeft',
                'DiagonalRight'
            ],
            lineStyle: [
                'None',
                'Continuous',
                'Dash',
                'Dot',
                'DashDot',
                'DashDotDot',
                'SlantDashDot',
                'Double'
            ],
            weight: [
                0,
                1,
                2,
                3
            ]
        },
        interior: {
            pattern: [
                'None',
                'Solid',
                'Gray75',
                'Gray50',
                'Gray25',
                'Gray125',
                'Gray0625',
                'HorzStripe',
                'VertStripe',
                'ReverseDiagStripe',
                'DiagStripe',
                'DiagCross',
                'ThickDiagCross',
                'ThinHorzStripe',
                'ThinVertStripe',
                'ThinReverseDiagStripe',
                'ThinDiagStripe',
                'ThinHorzCross',
                'ThinDiagCross'
            ]
        },
        protection: {
            "protected": [
                true,
                false
            ],
            hideFormula: [
                true,
                false
            ]
        }
    },
    tpl: [
        '       <Style ss:ID="{id}"',
        '<tpl if="this.exists(parentId)"> ss:Parent="{parentId}"</tpl>',
        '<tpl if="this.exists(name)"> ss:Name="{name}"</tpl>',
        '>\n',
        '<tpl if="this.exists(alignment)">           <Alignment{[this.getAttributes(values.alignment, "alignment")]}/>\n</tpl>',
        '<tpl if="this.exists(borders)">',
        '           <Borders>\n',
        '<tpl for="borders">               <Border{[this.getAttributes(values, "border")]}/>\n</tpl>',
        '           </Borders>\n',
        '</tpl>',
        '<tpl if="this.exists(font)">           <Font{[this.getAttributes(values.font, "font")]}/>\n</tpl>',
        '<tpl if="this.exists(interior)">           <Interior{[this.getAttributes(values.interior, "interior")]}/>\n</tpl>',
        '<tpl if="this.exists(format)">           <NumberFormat ss:Format="{format}"/>\n</tpl>',
        '<tpl if="this.exists(protection)">           <Protection{[this.getAttributes(values.protection, "protection")]}/>\n</tpl>',
        '       </Style>\n',
        {
            exists: function(value) {
                return !Ext.isEmpty(value);
            },
            getAttributes: function(obj, checkName) {
                var template = ' ss:{0}="{1}"',
                    keys = Ext.Object.getKeys(obj || {}),
                    len = keys.length,
                    s = '',
                    i, key;
                for (i = 0; i < len; i++) {
                    key = keys[i];
                    s += Ext.String.format(template, Ext.String.capitalize(key), Ext.isBoolean(obj[key]) ? Number(obj[key]) : obj[key]);
                }
                return s;
            }
        }
    ]
});

/**
 * This class is used to create an xml Excel Row
 */
Ext.define('Ext.exporter.file.excel.Row', {
    extend: 'Ext.exporter.file.Base',
    config: {
        /**
         * @cfg {Boolean} [autoFitHeight=false]
         *
         * Set this to 1 if you want to auto fit its height
         */
        autoFitHeight: false,
        /**
         * @cfg {String} caption
         *
         * Specifies the caption that should appear when the Component's custom row and column headers are showing.
         */
        caption: null,
        /**
         * @cfg {Ext.exporter.file.excel.Cell[]} cells
         *
         * Collection of cells available on this row.
         */
        cells: [],
        /**
         * @cfg {Number} height
         *
         * Row's height in the Excel table
         */
        height: null,
        /**
         * @cfg {String} index
         *
         * Index of this row in the Excel table
         */
        index: null,
        /**
         * @cfg {Number} span
         *
         * Specifies the number of adjacent rows with the same formatting as this row. When a Span attribute
         * is used, the spanned row elements are not written out.
         *
         * As mentioned in the index config, rows must not overlap. Doing so results in an XML Spreadsheet document
         * that is invalid. Care must be taken with this attribute to ensure that the span does not include another
         * row index that is specified.
         *
         * Unlike columns, rows with the Span attribute must be empty. A row that contains a Span attribute and
         * one or more Cell elements is considered invalid. The Span attribute for rows is a short-hand method
         * for setting formatting properties for multiple, empty rows.
         *
         */
        span: null,
        /**
         * @cfg {String} styleId
         *
         * Excel style attached to this row
         */
        styleId: null
    },
    /**
     * @method getCells
     * @return {Ext.util.Collection}
     *
     * Returns the collection of cells available in this row
     */
    tpl: [
        '           <Row',
        '<tpl if="this.exists(index)"> ss:Index="{index}"</tpl>',
        '<tpl if="this.exists(caption)"> c:Caption="{caption}"</tpl>',
        '<tpl if="this.exists(autoFitHeight)"> ss:AutoFitHeight="{autoFitHeight:this.toNumber}"</tpl>',
        '<tpl if="this.exists(span)"> ss:Span="{span}"</tpl>',
        '<tpl if="this.exists(height)"> ss:Height="{height}"</tpl>',
        '<tpl if="this.exists(styleId)"> ss:StyleID="{styleId}"</tpl>',
        '>\n',
        '<tpl if="cells"><tpl for="cells.getRange()">{[values.render()]}</tpl></tpl>',
        '           </Row>\n',
        {
            exists: function(value) {
                return !Ext.isEmpty(value);
            },
            toNumber: function(value) {
                return Number(Boolean(value));
            }
        }
    ],
    destroy: function() {
        this.setCells(null);
        this.callParent();
    },
    applyCells: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.file.excel.Cell');
    },
    /**
     * Convenience method to add cells. You can also use workbook.getCells().add(config).
     * @param {Object/Array} config
     * @return {Ext.exporter.file.excel.Cell/Ext.exporter.file.excel.Cell[]}
     */
    addCell: function(config) {
        return this.getCells().add(config || {});
    },
    /**
     * Convenience method to fetch a cell by its id.
     * @param id
     * @return {Ext.exporter.file.excel.Cell}
     */
    getCell: function(id) {
        return this.getCells().get(id);
    }
});

/**
 * This class is used to create an xml Excel Column.
 *
 * Columns are usually created when you want to add a special style to them.
 */
Ext.define('Ext.exporter.file.excel.Column', {
    extend: 'Ext.exporter.file.Base',
    config: {
        /**
         * @cfg {Boolean} [autoFitWidth=false]
         *
         * Use 1 if you want this column to auto fit its width.
         * Textual values do not autofit.
         */
        autoFitWidth: false,
        /**
         * @cfg {String} caption
         *
         * Specifies the caption that should appear when the Component's custom row and column headers are showing.
         */
        caption: null,
        /**
         * @cfg {Boolean} hidden
         *
         * `true` specifies that this column is hidden. `false` (or omitted) specifies that this column is shown.
         */
        hidden: null,
        /**
         * @cfg {Number} index
         *
         * Index of this column in the Excel table.
         *
         * If this tag is not specified, the first instance has an assumed Index="1". Each additional Column element
         * has an assumed Index that is one higher.
         *
         * Indices must appear in strictly increasing order. Failure to do so will result in an XML Spreadsheet
         * document that is invalid. Indices do not need to be sequential, however. Omitted indices are formatted
         * with the default style's format.
         *
         * Indices must not overlap. If duplicates exist, the behavior is unspecified and the XML Spreadsheet
         * document is considered invalid. An easy way to create overlap is through careless use of the Span attribute.
         */
        index: null,
        /**
         * @cfg {Number} span
         *
         * Specifies the number of adjacent columns with the same formatting as this column. When a Span attribute
         * is used, the spanned column elements are not written out.
         *
         * As mentioned in the index config, columns must not overlap. Doing so results in an XML Spreadsheet document
         * that is invalid. Care must be taken with this attribute to ensure that the span does not include another
         * column index that is specified.
         */
        span: null,
        /**
         * @cfg {String} styleId
         *
         * Excel style attached to this column
         */
        styleId: null,
        /**
         * @cfg {Number} width
         *
         * Specifies the width of a column in points. This value must be greater than or equal to 0.
         */
        width: null
    },
    tpl: [
        '<Column',
        '<tpl if="this.exists(index)"> ss:Index="{index}"</tpl>',
        '<tpl if="this.exists(caption)"> c:Caption="{caption}"</tpl>',
        '<tpl if="this.exists(styleId)"> ss:StyleID="{styleId}"</tpl>',
        '<tpl if="this.exists(hidden)"> ss:Hidden="{hidden}"</tpl>',
        '<tpl if="this.exists(span)"> ss:Span="{span}"</tpl>',
        '<tpl if="this.exists(width)"> ss:Width="{width}"</tpl>',
        '<tpl if="this.exists(autoFitWidth)"> ss:AutoFitWidth="{autoFitWidth:this.toNumber}"</tpl>',
        '/>\n',
        {
            exists: function(value) {
                return !Ext.isEmpty(value);
            },
            toNumber: function(value) {
                return Number(Boolean(value));
            }
        }
    ]
});

/**
 * This class is used to create an xml Excel Cell.
 *
 * The data type of the cell value is automatically determined.
 */
Ext.define('Ext.exporter.file.excel.Cell', {
    extend: 'Ext.exporter.file.Base',
    config: {
        /**
         * @cfg {String} dataType (required)
         *
         * Excel data type for the cell value. It is automatically set when the value is set.
         *
         * Possible values: `Number`, `DateTime`, `Boolean`, `String`
         */
        dataType: 'String',
        /**
         * @cfg {String} formula
         *
         * Specifies the formula stored in this cell. All formulas are persisted in R1C1 notation because they are
         * significantly easier to parse and generate than A1-style formulas. The formula is calculated upon reload
         * unless calculation is set to manual. Recalculation of the formula overrides the value in this cell's Value config.
         *
         * Examples:
         *
         * - "=SUM(R1C1:R2C2)": sums up values from Row1/Column1 to Row2/Column2
         * - "=SUM(R[-2]C:R[-1]C[1])": sums up values from 2 rows above the current row and current column to
         * values from 1 row above the current row and 1 column after the current column
         * - "=SUM(R[-1]C,R[-1]C[1])": sums up values from cell positioned one row above current row and current column,
         * and the cell positioned one row above current row and next column
         *
         * Check Excel for more formulas.
         */
        formula: null,
        /**
         * @cfg {Number} index
         *
         * Specifies the column index of this cell within the containing row. If this tag is not specified, the first
         * instance of a Cell element within a row has an assumed Index="1". Each additional Cell element has an assumed
         * Index that is one higher.
         *
         * Indices must appear in strictly increasing order. Failure to do so will result in an XML Spreadsheet
         * document that is invalid. Indices do not need to be sequential, however. Omitted indices are formatted with
         * either the default format, the column's format, or the table's format (depending on what has been specified).
         *
         * Indices must not overlap. If duplicates exist, the behavior is unspecified and the XML Spreadsheet document
         * is considered invalid. If the previous cell is a merged cell and no index is specified on this cell, its
         * start index is assumed to be the first cell after the merge.
         */
        index: null,
        /**
         * @cfg {String} styleId
         *
         * Excel style attached to this cell
         */
        styleId: null,
        /**
         * @cfg {Number} mergeAcross
         *
         * Number of cells to merge to the right side of this cell
         */
        mergeAcross: null,
        /**
         * @cfg {Number} mergeDown
         *
         * Number of cells to merge below this cell
         */
        mergeDown: null,
        /**
         * @cfg {Number/Date/String} value (required)
         *
         * Value assigned to this cell
         */
        value: ''
    },
    tpl: [
        '               <Cell',
        '<tpl if="this.exists(index)"> ss:Index="{index}"</tpl>',
        '<tpl if="this.exists(styleId)"> ss:StyleID="{styleId}"</tpl>',
        '<tpl if="this.exists(mergeAcross)"> ss:MergeAcross="{mergeAcross}"</tpl>',
        '<tpl if="this.exists(mergeDown)"> ss:MergeDown="{mergeDown}"</tpl>',
        '<tpl if="this.exists(formula)"> ss:Formula="{formula}"</tpl>',
        '>\n',
        '                   <Data ss:Type="{dataType}">{value}</Data>\n',
        '               </Cell>\n',
        {
            exists: function(value) {
                return !Ext.isEmpty(value);
            }
        }
    ],
    applyValue: function(v) {
        var dt = 'String',
            format = Ext.util.Format;
        // let's detect the data type
        if (v instanceof Date) {
            dt = 'DateTime';
            v = Ext.Date.format(v, 'Y-m-d\\TH:i:s.u');
        } else if (Ext.isNumber(v)) {
            dt = 'Number';
        } else if (Ext.isBoolean(v)) {
            dt = 'Boolean';
        } else {
            // cannot use here stripTags
            // this value goes into an xml tag and we need to force html encoding
            // for chars like &><
            v = format.htmlEncode(format.htmlDecode(v));
        }
        this.setDataType(dt);
        return v;
    }
});

/**
 * This class generates an Excel 2003 XML workbook.
 *
 * The workbook is the top level object of an xml Excel file.
 * It should have at least one Worksheet before rendering.
 *
 * This is how an xml Excel file looks like:
 *
 *  - Workbook
 *      - Style[]
 *      - Worksheet[]
 *          - Table[]
 *              - Column[]
 *              - Row[]
 *                  - Cell[]
 *
 *
 * Check Microsoft's website for more info about Excel XML:
 * https://msdn.microsoft.com/en-us/Library/aa140066(v=office.10).aspx
 *
 *
 * Here is an example of how to create an Excel XML document:
 *
 *      var workbook = Ext.create('Ext.exporter.file.excel.Workbook', {
 *              title:  'My document',
 *              author: 'John Doe'
 *          }),
 *          table = workbook.addWorksheet({
 *              name:   'Sheet 1'
 *          }).addTable();
 *
 *      // add formatting to the first two columns of the spreadsheet
 *      table.addColumn({
 *          width:  120,
 *          styleId: workbook.addStyle({
 *              format: 'Long Time'
 *          }).getId()
 *      });
 *      table.addColumn({
 *          width:  100,
 *          styleId: workbook.addStyle({
 *              format: 'Currency'
 *          }).getId()
 *      });
 *
 *      // add rows and cells with data
 *      table.addRow().addCell([{
 *          value: 'Date'
 *      },{
 *          value: 'Value'
 *      }]);
 *      table.addRow().addCell([{
 *          value: new Date('06/17/2015')
 *      },{
 *          value: 15
 *      }]);
 *      table.addRow().addCell([{
 *          value: new Date('06/18/2015')
 *      },{
 *          value: 30
 *      }]);
 *
 *      //add a formula on the 4th row which sums up the previous 2 rows
 *      table.addRow().addCell({
 *          index: 2,
 *          formula: '=SUM(R[-2]C:R[-1]C)'
 *      });
 *
 *      // save the document in the browser
 *      Ext.exporter.File.saveAs(workbook.render(), 'document.xml', 'UTF-8');
 *
 */
Ext.define('Ext.exporter.file.excel.Workbook', {
    extend: 'Ext.exporter.file.Base',
    requires: [
        'Ext.exporter.file.excel.Worksheet',
        'Ext.exporter.file.excel.Table',
        'Ext.exporter.file.excel.Style',
        'Ext.exporter.file.excel.Row',
        'Ext.exporter.file.excel.Column',
        'Ext.exporter.file.excel.Cell'
    ],
    config: {
        /**
         * @cfg {String} [title="Workbook"]
         *
         * The title of the workbook
         */
        title: "Workbook",
        /**
         * @cfg {String} [author="Sencha"]
         *
         * The author of the generated Excel file
         */
        author: 'Sencha',
        /**
         * @cfg {Number} [windowHeight=9000]
         *
         * Excel window height
         */
        windowHeight: 9000,
        /**
         * @cfg {Number} [windowWidth=50000]
         *
         * Excel window width
         */
        windowWidth: 50000,
        /**
         * @cfg {Boolean} [protectStructure=false]
         *
         * Protect structure
         */
        protectStructure: false,
        /**
         * @cfg {Boolean} [protectWindows=false]
         *
         * Protect windows
         */
        protectWindows: false,
        /**
         * @cfg {Ext.exporter.file.excel.Style[]} styles
         *
         * Collection of styles available in this workbook
         */
        styles: [],
        /**
         * @cfg {Ext.exporter.file.excel.Worksheet[]} worksheets
         *
         * Collection of worksheets available in this workbook
         */
        worksheets: []
    },
    /**
     * @method getStyles
     * @returns {Ext.util.Collection}
     *
     * Returns the collection of styles available in this workbook
     */
    /**
     * @method getWorksheets
     * @returns {Ext.util.Collection}
     *
     * Returns the collection of worksheets available in this workbook
     */
    tpl: [
        '<?xml version="1.0" encoding="utf-8"?>\n',
        '<?mso-application progid="Excel.Sheet"?>\n',
        '<Workbook ',
        'xmlns="urn:schemas-microsoft-com:office:spreadsheet" ',
        'xmlns:o="urn:schemas-microsoft-com:office:office" ',
        'xmlns:x="urn:schemas-microsoft-com:office:excel" ',
        'xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet" ',
        'xmlns:html="http://www.w3.org/TR/REC-html40">\n',
        '   <DocumentProperties xmlns="urn:schemas-microsoft-com:office:office">\n',
        '       <Title>{title:htmlEncode}</Title>\n',
        '       <Author>{author:htmlEncode}</Author>\n',
        '       <Created>{createdAt}</Created>\n',
        '   </DocumentProperties>\n',
        '   <ExcelWorkbook xmlns="urn:schemas-microsoft-com:office:excel">\n',
        '       <WindowHeight>{windowHeight}</WindowHeight>\n',
        '       <WindowWidth>{windowWidth}</WindowWidth>\n',
        '       <ProtectStructure>{protectStructure}</ProtectStructure>\n',
        '       <ProtectWindows>{protectWindows}</ProtectWindows>\n',
        '   </ExcelWorkbook>\n',
        '   <Styles>\n',
        '<tpl if="styles"><tpl for="styles.getRange()">{[values.render()]}</tpl></tpl>',
        '   </Styles>\n',
        '<tpl if="worksheets"><tpl for="worksheets.getRange()">{[values.render()]}</tpl></tpl>',
        '</Workbook>'
    ],
    destroy: function() {
        this.setStyles(null);
        this.setWorksheets(null);
        this.callParent();
    },
    applyStyles: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.file.excel.Style');
    },
    applyWorksheets: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.file.excel.Worksheet');
    },
    /**
     * Convenience method to add styles. You can also use workbook.getStyles().add(config).
     * @param {Object/Array} config
     * @returns {Ext.exporter.file.excel.Style/Ext.exporter.file.excel.Style[]}
     */
    addStyle: function(config) {
        return this.getStyles().add(config || {});
    },
    /**
     * Convenience method to fetch a style by its id.
     * @param id
     * @returns {Ext.exporter.file.excel.Style}
     */
    getStyle: function(id) {
        return this.getStyles().get(id);
    },
    /**
     * Convenience method to add worksheets. You can also use workbook.getWorksheets().add(config).
     * @param {Object/Array} config
     * @returns {Ext.exporter.file.excel.Worksheet/Ext.exporter.file.excel.Worksheet[]}
     */
    addWorksheet: function(config) {
        return this.getWorksheets().add(config || {});
    },
    /**
     * Convenience method to fetch a worksheet by its id.
     * @param id
     * @returns {Ext.exporter.file.excel.Worksheet}
     */
    getWorksheet: function(id) {
        return this.getWorksheets().get(id);
    }
});

/**
 * This exporter produces Microsoft Excel 2003 XML files for the supplied data. It was implemented according to
 * [this][1] documentation.
 *
 * [1]: https://msdn.microsoft.com/en-us/Library/aa140066(v=office.10).aspx
 */
Ext.define('Ext.exporter.excel.Xml', {
    extend: 'Ext.exporter.Base',
    alias: 'exporter.excel03',
    requires: [
        'Ext.exporter.file.excel.Workbook'
    ],
    config: {
        /**
         * @cfg {Number} windowHeight
         *
         * Excel window height
         */
        windowHeight: 9000,
        /**
         * @cfg {Number} windowWidth
         *
         * Excel window width
         */
        windowWidth: 50000,
        /**
         * @cfg {Boolean} protectStructure
         *
         * Protect structure
         */
        protectStructure: false,
        /**
         * @cfg {Boolean} protectWindows
         *
         * Protect windows
         */
        protectWindows: false,
        /**
         * @cfg {Ext.exporter.file.excel.Style} defaultStyle
         *
         * Default style applied to all cells
         */
        defaultStyle: {
            alignment: {
                vertical: 'Top'
            },
            font: {
                fontName: 'Calibri',
                family: 'Swiss',
                size: 11,
                color: '#000000'
            }
        },
        /**
         * @cfg {Ext.exporter.file.excel.Style} titleStyle
         *
         * Default style applied to the title
         */
        titleStyle: {
            name: 'Title',
            parentId: 'Default',
            alignment: {
                horizontal: 'Center',
                vertical: 'Center'
            },
            font: {
                fontName: 'Cambria',
                family: 'Swiss',
                size: 18,
                color: '#1F497D'
            }
        },
        /**
         * @cfg {Ext.exporter.file.excel.Style} groupHeaderStyle
         *
         * Default style applied to the group headers
         */
        groupHeaderStyle: {
            name: 'Group Header',
            parentId: 'Default',
            borders: [
                {
                    position: 'Bottom',
                    lineStyle: 'Continuous',
                    weight: 1,
                    color: '#4F81BD'
                }
            ]
        },
        /**
         * @cfg {Ext.exporter.file.excel.Style} groupFooterStyle
         *
         * Default style applied to the group footers
         */
        groupFooterStyle: {
            borders: [
                {
                    position: 'Top',
                    lineStyle: 'Continuous',
                    weight: 1,
                    color: '#4F81BD'
                }
            ]
        },
        /**
         * @cfg {Ext.exporter.file.excel.Style} tableHeaderStyle
         *
         * Default style applied to the table headers
         */
        tableHeaderStyle: {
            name: 'Heading 1',
            parentId: 'Default',
            alignment: {
                horizontal: 'Center',
                vertical: 'Center'
            },
            borders: [
                {
                    position: 'Bottom',
                    lineStyle: 'Continuous',
                    weight: 1,
                    color: '#4F81BD'
                }
            ],
            font: {
                fontName: 'Calibri',
                family: 'Swiss',
                size: 11,
                color: '#1F497D'
            }
        }
    },
    fileName: 'export.xml',
    mimeType: 'application/vnd.ms-excel',
    titleRowHeight: 22.5,
    headerRowHeight: 20.25,
    destroy: function() {
        var me = this;
        me.workbook = me.table = me.columnStylesFooter = me.columnStylesNormal = Ext.destroy(me.workbook);
        me.callParent();
    },
    applyDefaultStyle: function(newValue) {
        // the default style should always have the id Default and name Normal
        return Ext.applyIf({
            id: 'Default',
            name: 'Normal'
        }, newValue || {});
    },
    getContent: function() {
        var me = this,
            config = this.getConfig(),
            data = config.data,
            colMerge;
        me.workbook = new Ext.exporter.file.excel.Workbook({
            title: config.title,
            author: config.author,
            windowHeight: config.windowHeight,
            windowWidth: config.windowWidth,
            protectStructure: config.protectStructure,
            protectWindows: config.protectWindows
        });
        me.table = me.workbook.addWorksheet({
            name: config.title
        }).addTable();
        me.workbook.addStyle(config.defaultStyle);
        me.tableHeaderStyleId = me.workbook.addStyle(config.tableHeaderStyle).getId();
        me.groupHeaderStyleId = me.workbook.addStyle(config.groupHeaderStyle).getId();
        colMerge = data ? data.getColumnCount() : 1;
        me.addTitle(config, colMerge);
        if (data) {
            me.buildHeader();
            me.table.addRow(me.buildRows(data.getGroups(), colMerge, 0));
        }
        return me.workbook.render();
    },
    addTitle: function(config, colMerge) {
        if (!Ext.isEmpty(config.title)) {
            this.table.addRow({
                autoFitHeight: 1,
                height: this.titleRowHeight,
                styleId: this.workbook.addStyle(config.titleStyle).getId()
            }).addCell({
                mergeAcross: colMerge - 1,
                value: config.title
            });
        }
    },
    buildRows: function(groups, colMerge, level) {
        var me = this,
            showSummary = me.getShowSummary(),
            rows = [],
            g, row, styleH, styleF, cells, i, j, k, gLen, sLen, cLen, oneLine, cell;
        if (!groups) {
            return;
        }
        styleH = me.workbook.addStyle({
            parentId: me.groupHeaderStyleId,
            alignment: {
                Indent: level > 0 ? level - 1 : 0
            }
        }).getId();
        styleF = me.workbook.addStyle({
            parentId: me.columnStylesFooter[0],
            alignment: {
                Indent: level > 0 ? level - 1 : 0
            }
        }).getId();
        gLen = groups.length;
        for (i = 0; i < gLen; i++) {
            g = groups.items[i];
            // if the group has no subgroups and no rows then show only summaries
            oneLine = (!g._groups && !g._rows);
            if (showSummary !== false && !Ext.isEmpty(g._text) && !oneLine) {
                rows.push({
                    cells: [
                        {
                            mergeAcross: colMerge - 1,
                            value: g._text,
                            styleId: styleH
                        }
                    ]
                });
            }
            if (g._groups) {
                Ext.Array.insert(rows, rows.length, me.buildRows(g._groups, colMerge, level + 1));
            }
            if (g._rows) {
                sLen = g._rows.length;
                for (k = 0; k < sLen; k++) {
                    row = {
                        cells: []
                    };
                    cells = g._rows.items[k]._cells;
                    cLen = cells.length;
                    for (j = 0; j < cLen; j++) {
                        cell = cells.items[j];
                        row.cells.push({
                            value: cell._value,
                            styleId: this.columnStylesNormal[j]
                        });
                    }
                    rows.push(row);
                }
            }
            if (g._summaries && (showSummary || oneLine)) {
                sLen = g._summaries.length;
                for (k = 0; k < sLen; k++) {
                    // that's the summary footer
                    row = {
                        cells: []
                    };
                    cells = g._summaries.items[k]._cells;
                    cLen = cells.length;
                    for (j = 0; j < cLen; j++) {
                        cell = cells.items[j];
                        row.cells.push({
                            value: cell._value,
                            styleId: oneLine ? me.columnStylesNormal[j] : (j === 0 ? styleF : me.columnStylesFooter[j])
                        });
                    }
                    rows.push(row);
                }
            }
        }
        return rows;
    },
    buildHeader: function() {
        var me = this,
            ret = {},
            data = me.getData(),
            keys, row, i, j, len, lenCells, style, arr, fStyle;
        me.buildHeaderRows(data.getColumns(), ret);
        keys = Ext.Object.getKeys(ret);
        len = keys.length;
        for (i = 0; i < len; i++) {
            row = me.table.addRow({
                height: me.headerRowHeight,
                autoFitHeight: 1
            });
            arr = ret[keys[i]];
            lenCells = arr.length;
            for (j = 0; j < lenCells; j++) {
                row.addCell(arr[j]).setStyleId(me.tableHeaderStyleId);
            }
        }
        arr = data.getBottomColumns();
        lenCells = arr.length;
        me.columnStylesNormal = [];
        me.columnStylesFooter = [];
        fStyle = me.getGroupFooterStyle();
        for (j = 0; j < lenCells; j++) {
            style = Ext.applyIf({
                parentId: 'Default'
            }, fStyle);
            style = Ext.merge(style, arr[j].getStyle());
            style.id = null;
            me.columnStylesFooter.push(me.workbook.addStyle(style).getId());
            style = Ext.merge({
                parentId: 'Default'
            }, arr[j].getStyle());
            me.columnStylesNormal.push(me.workbook.addStyle(style).getId());
        }
    },
    buildHeaderRows: function(columns, result) {
        var col, cols, i, len, name;
        if (!columns) {
            return;
        }
        len = columns.length;
        for (i = 0; i < len; i++) {
            col = columns.items[i].getConfig();
            col.value = col.text;
            cols = col.columns;
            delete (col.columns);
            delete (col.table);
            name = 's' + col.level;
            result[name] = result[name] || [];
            result[name].push(col);
            this.buildHeaderRows(cols, result);
        }
    }
});

/**
 * @private
 */
Ext.define('Ext.exporter.file.html.Style', {
    extend: 'Ext.exporter.file.Style',
    mappings: {
        readingOrder: {
            LeftToRight: 'ltr',
            RightToLeft: 'rtl',
            Context: 'initial',
            Automatic: 'initial'
        },
        horizontal: {
            Automatic: 'initial',
            Left: 'left',
            Center: 'center',
            Right: 'right',
            Justify: 'justify'
        },
        vertical: {
            Top: 'top',
            Bottom: 'bottom',
            Center: 'middle',
            Automatic: 'baseline'
        },
        lineStyle: {
            None: 'none',
            Continuous: 'solid',
            Dash: 'dashed',
            Dot: 'dotted'
        }
    },
    render: function() {
        var cfg = this.getConfig(),
            map = this.mappings,
            s = '',
            align = cfg.alignment,
            font = cfg.font,
            borders = cfg.borders,
            interior = cfg.interior,
            i, length, name, border;
        if (align) {
            if (align.horizontal) {
                s += 'text-align: ' + map.horizontal[align.horizontal] + ';\n';
            }
            if (align.readingOrder) {
                s += 'direction: ' + map.readingOrder[align.readingOrder] + ';\n';
            }
            if (align.vertical) {
                s += 'vertical-align: ' + map.vertical[align.vertical] + ';\n';
            }
            if (align.indent) {
                s += 'padding-left: ' + align.indent + 'px;\n';
            }
        }
        if (font) {
            if (font.size) {
                s += 'font-size: ' + font.size + 'px;\n';
            }
            if (font.bold) {
                s += 'font-weight: bold;\n';
            }
            if (font.italic) {
                s += 'font-style: italic;\n';
            }
            if (font.strikeThrough) {
                s += 'text-decoration: line-through;\n';
            }
            if (font.underline === 'Single') {
                s += 'text-decoration: underline;\n';
            }
            if (font.color) {
                s += 'color: ' + font.color + ';\n';
            }
        }
        if (interior && interior.color) {
            s += 'background-color: ' + interior.color + ';\n';
        }
        if (borders) {
            length = borders.length;
            for (i = 0; i < length; i++) {
                border = borders[i];
                name = 'border-' + border.position.toLowerCase();
                s += name + '-width: ' + (border.weight || 0) + 'px;\n';
                s += name + '-style: ' + (map.lineStyle[border.lineStyle] || 'initial') + ';\n';
                s += name + '-color: ' + (border.color || 'initial') + ';\n';
            }
        }
        return cfg.name + '{\n' + s + '}\n';
    }
});

/**
 * @private
 */
Ext.define('Ext.exporter.file.html.Doc', {
    extend: 'Ext.exporter.file.Base',
    requires: [
        'Ext.exporter.file.html.Style'
    ],
    config: {
        /**
         * @cfg {String} [title="Title"]
         *
         * The title of the html document
         */
        title: "Title",
        /**
         * @cfg {String} [author="Sencha"]
         *
         * The author of the generated html file
         */
        author: 'Sencha',
        /**
         * @cfg {String} [charset="UTF-8"]
         *
         * Html document charset
         */
        charset: 'UTF-8',
        /**
         * @cfg {Ext.exporter.file.html.Style[]} styles
         *
         * Collection of styles available in this workbook
         */
        styles: [],
        /**
         * @cfg {Object} table
         */
        table: null
    },
    destroy: function() {
        this.setStyles(null);
        this.setTable(null);
        this.callParent();
    },
    applyStyles: function(data, dataCollection) {
        return this.checkCollection(data, dataCollection, 'Ext.exporter.file.html.Style');
    },
    /**
     * Convenience method to add styles.
     * @param {Object/Array} config
     * @returns {Ext.exporter.file.html.Style/Ext.exporter.file.html.Style[]}
     */
    addStyle: function(config) {
        return this.getStyles().add(config || {});
    },
    /**
     * Convenience method to fetch a style by its id.
     * @param id
     * @returns {Ext.exporter.file.html.Style}
     */
    getStyle: function(id) {
        return this.getStyles().get(id);
    }
});

/**
 * Represents a field on the page or report filter of the PivotTable.
 *
 * [CT_PageField]
 * @private
 */
Ext.define('Ext.exporter.file.ooxml.excel.PageField', {
    extend: 'Ext.exporter.file.ooxml.Base',
    config: {
        /**
         * @cfg {String} [cap]
         *
         * Specifies the display name of the hierarchy.
         */
        cap: null,
        /**
         * @cfg {Number} fld (required)
         *
         * Specifies the index of the field that appears on the page or filter report area of the PivotTable.
         */
        fld: null,
        /**
         * @cfg {Number} [hier]
         *
         * Specifies the index of the OLAP hierarchy to which this item belongs.
         */
        hier: null,
        /**
         * @cfg {Number} [item]
         *
         * Specifies the index of the item in the PivotCache.
         */
        item: null,
        /**
         * @cfg {String} [name]
         *
         * Specifies the unique name of the hierarchy.
         */
        name: null
    },
    /**
     * @cfg generateTplAttributes
     * @inheritdoc Ext.exporter.file.ooxml.Base#cfg!generateTplAttributes
     * @localdoc
     *
     * **Note** Do not rename the config names that are part of the `attributes` since they are
     * mapped to the xml attributes needed by the template.
     */
    generateTplAttributes: true,
    tpl: [
        '<pageField {attributes} />'
    ]
});

/**
 * This exporter produces CSV (comma separated values) files for the supplied data.
 */
Ext.define('Ext.exporter.text.CSV', {
    extend: 'Ext.exporter.Base',
    alias: 'exporter.csv',
    requires: [
        'Ext.util.CSV'
    ],
    fileName: 'export.csv',
    getHelper: function() {
        return Ext.util.CSV;
    },
    getContent: function() {
        var me = this,
            result = [],
            data = me.getData();
        if (data) {
            me.buildHeader(result);
            me.buildRows(data.getGroups(), result, data.getColumnCount());
            me.columnStyles = Ext.destroy(me.columnStyles);
        }
        return me.getHelper().encode(result);
    },
    buildHeader: function(result) {
        var me = this,
            ret = {},
            data = me.getData(),
            arr, lenCells, i, style;
        me.buildHeaderRows(data.getColumns(), ret);
        result.push.apply(result, Ext.Object.getValues(ret));
        arr = data.getBottomColumns();
        lenCells = arr.length;
        me.columnStyles = [];
        for (i = 0; i < lenCells; i++) {
            style = arr[i].getStyle() || {};
            if (!style.id) {
                style.id = 'c' + i;
            }
            style.name = '.' + style.id;
            me.columnStyles.push(new Ext.exporter.file.Style(style));
        }
    },
    buildHeaderRows: function(columns, result) {
        var col, i, len, name, mAcross, mDown, j, level;
        if (!columns) {
            return;
        }
        len = columns.length;
        for (i = 0; i < len; i++) {
            col = columns.items[i];
            mAcross = col._mergeAcross;
            mDown = col._mergeDown;
            level = col._level;
            name = 's' + level;
            result[name] = result[name] || [];
            result[name].push(col._text);
            for (j = 1; j <= mAcross; j++) {
                result[name].push('');
            }
            for (j = 1; j <= mDown; j++) {
                name = 's' + (level + j);
                result[name] = result[name] || [];
                result[name].push('');
            }
            this.buildHeaderRows(col._columns, result);
        }
    },
    buildRows: function(groups, result, length) {
        var showSummary = this._showSummary,
            g, i, row, gLen, j, rLen, k, cLen, r, cells, oneLine, cell, style;
        if (!groups) {
            return;
        }
        gLen = groups.length;
        for (i = 0; i < gLen; i++) {
            g = groups.items[i];
            // if the group has no subgroups and no rows then show only summaries
            oneLine = (!g._groups && !g._rows);
            if (!Ext.isEmpty(g._text) && !oneLine) {
                row = [];
                row.length = length;
                row[g.level || 0] = g._text;
                result.push(row);
            }
            if (g._groups) {
                this.buildRows(g._groups, result, length);
            }
            if (g._rows) {
                rLen = g._rows.length;
                for (j = 0; j < rLen; j++) {
                    row = [];
                    r = g._rows.items[j];
                    cells = r._cells;
                    cLen = cells.length;
                    for (k = 0; k < cLen; k++) {
                        cell = cells.items[k];
                        style = this.columnStyles[k];
                        cell = style ? style.getFormattedValue(cell._value) : cell._value;
                        row.push(cell);
                    }
                    result.push(row);
                }
            }
            if (g._summaries && (showSummary || oneLine)) {
                rLen = g._summaries.length;
                for (j = 0; j < rLen; j++) {
                    row = [];
                    r = g._summaries.items[j];
                    cells = r._cells;
                    cLen = cells.length;
                    for (k = 0; k < cLen; k++) {
                        cell = cells.items[k];
                        style = this.columnStyles[k];
                        cell = style ? style.getFormattedValue(cell._value) : cell._value;
                        row.push(cell);
                    }
                    result.push(row);
                }
            }
        }
    }
});

/**
 * This exporter produces HTML files for the supplied data.
 */
Ext.define('Ext.exporter.text.Html', {
    extend: 'Ext.exporter.Base',
    alias: 'exporter.html',
    requires: [
        'Ext.exporter.file.html.Doc'
    ],
    config: {
        tpl: [
            '<!DOCTYPE html>\n',
            '<html>\n',
            '   <head>\n',
            '       <meta charset="{charset}">\n',
            '       <title>{title}</title>\n',
            '       <style>\n',
            '       table { border-collapse: collapse; border-spacing: 0; }\n',
            '<tpl if="styles"><tpl for="styles.getRange()">{[values.render()]}</tpl></tpl>',
            '       </style>\n',
            '   </head>\n',
            '   <body>\n',
            '       <h1>{title}</h1>\n',
            '       <table>\n',
            '           <thead>\n',
            '<tpl for="table.columns">',
            '               <tr>\n',
            '<tpl for=".">',
            '                   <th<tpl if="width"> width="{width}"</tpl><tpl if="mergeAcross"> colSpan="{mergeAcross}"</tpl><tpl if="mergeDown"> rowSpan="{mergeDown}"</tpl>>{text}</th>\n',
            '</tpl>',
            '               </tr>\n',
            '</tpl>',
            '           </thead>\n',
            '           <tbody>\n',
            '<tpl for="table.rows">',
            '               <tr<tpl if="cls"> class="{cls}"</tpl>>\n',
            '<tpl for="cells">',
            '                   <td<tpl if="cls"> class="{cls}"</tpl><tpl if="mergeAcross"> colSpan="{mergeAcross}"</tpl><tpl if="mergeDown"> rowSpan="{mergeDown}"</tpl>>{value}</td>\n',
            '</tpl>',
            '               </tr>\n',
            '</tpl>',
            '           </tbody>\n',
            '           <tfoot>\n',
            '               <tr>\n',
            '                   <th<tpl if="table.columnsCount"> colSpan="{table.columnsCount}"</tpl>>&nbsp;</th>\n',
            '               </tr>\n',
            '           </tfoot>\n',
            '       </table>\n',
            '   </body>\n',
            '</html>'
        ],
        /**
         * @cfg {Ext.exporter.file.html.Style} defaultStyle
         *
         * Default style applied to all cells
         */
        defaultStyle: {
            name: 'table tbody td, table thead th',
            alignment: {
                vertical: 'Top'
            },
            font: {
                fontName: 'Arial',
                size: 12,
                color: '#000000'
            },
            borders: [
                {
                    position: 'Left',
                    lineStyle: 'Continuous',
                    weight: 1,
                    color: '#4F81BD'
                },
                {
                    position: 'Right',
                    lineStyle: 'Continuous',
                    weight: 1,
                    color: '#4F81BD'
                }
            ]
        },
        /**
         * @cfg {Ext.exporter.file.html.Style} titleStyle
         *
         * Default style applied to the title
         */
        titleStyle: {
            name: 'h1',
            font: {
                fontName: 'Arial',
                size: 18,
                color: '#1F497D'
            }
        },
        /**
         * @cfg {Ext.exporter.file.html.Style} groupHeaderStyle
         *
         * Default style applied to the group headers
         */
        groupHeaderStyle: {
            name: '.groupHeader td',
            borders: [
                {
                    position: 'Top',
                    lineStyle: 'Continuous',
                    weight: 1,
                    color: '#4F81BD'
                },
                {
                    position: 'Bottom',
                    lineStyle: 'Continuous',
                    weight: 1,
                    color: '#4F81BD'
                }
            ]
        },
        /**
         * @cfg {Ext.exporter.file.html.Style} groupFooterStyle
         *
         * Default style applied to the group footers
         */
        groupFooterStyle: {
            name: '.groupFooter td',
            borders: [
                {
                    position: 'Bottom',
                    lineStyle: 'Continuous',
                    weight: 1,
                    color: '#4F81BD'
                }
            ]
        },
        /**
         * @cfg {Ext.exporter.file.html.Style} tableHeaderStyle
         *
         * Default style applied to the table headers
         */
        tableHeaderStyle: {
            name: 'table thead th',
            alignment: {
                horizontal: 'Center',
                vertical: 'Center'
            },
            borders: [
                {
                    position: 'Top',
                    lineStyle: 'Continuous',
                    weight: 1,
                    color: '#4F81BD'
                },
                {
                    position: 'Bottom',
                    lineStyle: 'Continuous',
                    weight: 1,
                    color: '#4F81BD'
                }
            ],
            font: {
                fontName: 'Arial',
                size: 12,
                color: '#1F497D'
            }
        },
        /**
         * @cfg {Ext.exporter.file.html.Style} tableFooterStyle
         *
         * Default style applied to the table footer
         */
        tableFooterStyle: {
            name: 'table tfoot th',
            borders: [
                {
                    position: 'Top',
                    lineStyle: 'Continuous',
                    weight: 1,
                    color: '#4F81BD'
                }
            ]
        }
    },
    fileName: 'export.html',
    mimeType: 'text/html',
    getContent: function() {
        var me = this,
            config = me.getConfig(),
            data = config.data,
            table = {
                columnsCount: 0,
                columns: [],
                rows: []
            },
            colMerge, html;
        me.doc = new Ext.exporter.file.html.Doc({
            title: config.title,
            author: config.author,
            tpl: config.tpl,
            styles: [
                config.defaultStyle,
                config.titleStyle,
                config.groupHeaderStyle,
                config.groupFooterStyle,
                config.tableHeaderStyle,
                config.tableFooterStyle
            ]
        });
        if (data) {
            colMerge = data.getColumnCount();
            Ext.apply(table, {
                columnsCount: data.getColumnCount(),
                columns: me.buildHeader(),
                rows: me.buildRows(data.getGroups(), colMerge, 0)
            });
        }
        me.doc.setTable(table);
        html = me.doc.render();
        me.doc = me.columnStyles = Ext.destroy(me.doc);
        return html;
    },
    buildRows: function(groups, colMerge, level) {
        var me = this,
            showSummary = me._showSummary,
            result = [],
            g, row, i, j, k, gLen, rLen, cLen, cell, r, cells, oneLine, style;
        if (groups) {
            me.doc.addStyle({
                name: '.levelHeader' + level,
                alignment: {
                    Horizontal: 'Left',
                    Indent: (level > 0 ? level - 1 : 0) * 5
                }
            });
            me.doc.addStyle({
                name: '.levelFooter' + level,
                alignment: {
                    Horizontal: 'Left',
                    Indent: (level > 0 ? level - 1 : 0) * 5
                }
            });
            gLen = groups.length;
            for (i = 0; i < gLen; i++) {
                g = groups.items[i];
                // if the group has no subgroups and no rows then show only summaries
                oneLine = (!g._groups && !g._rows);
                if (!Ext.isEmpty(g._text) && !oneLine) {
                    result.push({
                        cls: 'groupHeader',
                        cells: [
                            {
                                value: g._text,
                                mergeAcross: colMerge,
                                cls: 'levelHeader' + level
                            }
                        ]
                    });
                }
                if (g._groups) {
                    Ext.Array.insert(result, result.length, me.buildRows(g._groups, colMerge, level + 1));
                }
                if (g._rows) {
                    rLen = g._rows.length;
                    for (j = 0; j < rLen; j++) {
                        row = [];
                        r = g._rows.items[j];
                        cells = r._cells;
                        cLen = cells.length;
                        for (k = 0; k < cLen; k++) {
                            cell = cells.items[k].getConfig();
                            style = me.columnStyles[k];
                            if (style) {
                                cell.cls = style._id;
                                cell.value = style.getFormattedValue(cell.value);
                            }
                            row.push(cell);
                        }
                        result.push({
                            cells: row
                        });
                    }
                }
                if (g._summaries && (showSummary || oneLine)) {
                    rLen = g._summaries.length;
                    for (j = 0; j < rLen; j++) {
                        row = [];
                        r = g._summaries.items[j];
                        cells = r._cells;
                        cLen = cells.length;
                        for (k = 0; k < cLen; k++) {
                            cell = cells.items[k].getConfig();
                            style = me.columnStyles[k];
                            cell.cls = (k === 0 ? 'levelFooter' + level : '');
                            if (style) {
                                cell.cls += ' ' + style.getId();
                                cell.value = style.getFormattedValue(cell.value);
                            }
                            row.push(cell);
                        }
                        result.push({
                            cls: 'groupFooter' + (oneLine ? ' groupHeader' : ''),
                            cells: row
                        });
                    }
                }
            }
        }
        return result;
    },
    buildHeader: function() {
        var me = this,
            ret = {},
            data = me.getData(),
            arr, lenCells, i, style;
        me.buildHeaderRows(data.getColumns(), ret);
        arr = data.getBottomColumns();
        lenCells = arr.length;
        me.columnStyles = [];
        for (i = 0; i < lenCells; i++) {
            style = arr[i].getStyle() || {};
            if (!style.id) {
                style.id = Ext.id();
            }
            style.name = '.' + style.id;
            me.columnStyles.push(me.doc.addStyle(style));
        }
        return Ext.Object.getValues(ret);
    },
    buildHeaderRows: function(columns, result) {
        var col, i, len, name, s;
        if (!columns) {
            return;
        }
        len = columns.length;
        for (i = 0; i < len; i++) {
            col = columns.items[i].getConfig();
            name = 's' + col.level;
            result[name] = result[name] || [];
            if (col.mergeAcross) {
                col.mergeAcross++;
            }
            if (col.mergeDown) {
                col.mergeDown++;
            }
            result[name].push(col);
            this.buildHeaderRows(col.columns, result);
        }
    }
});

/**
 * This exporter produces TSV (tab separated values) files for the supplied data.
 */
Ext.define('Ext.exporter.text.TSV', {
    extend: 'Ext.exporter.text.CSV',
    alias: 'exporter.tsv',
    requires: [
        'Ext.util.TSV'
    ],
    getHelper: function() {
        return Ext.util.TSV;
    }
});

/**
 * Base class for the grid exporter plugin. It contains common functions for both classic and modern toolkits.
 *
 * This class is extended by the toolkit specific grid plugin.
 *
 * @private
 */
Ext.define('Ext.grid.plugin.BaseExporter', {
    extend: 'Ext.exporter.Plugin',
    /**
     * @event beforedocumentsave
     * Fires on the grid panel before a document is exported and saved.
     * @param {Ext.grid.Panel} grid Reference to the grid panel
     * @param {Object} params Additional parameters sent with this event
     * @param {Object} params.config The config object used in the {@link #saveDocumentAs} method
     * @param {Ext.exporter.Base} params.exporter A reference to the exporter object used to save the document
     */
    /**
     * @event documentsave
     * Fires on the grid panel whenever a document is exported and saved.
     * @param {Ext.grid.Panel} grid Reference to the grid panel
     * @param {Object} params Additional parameters sent with this event
     * @param {Object} params.config The config object used in the {@link #saveDocumentAs} method
     * @param {Ext.exporter.Base} params.exporter A reference to the exporter object used to save the document
     */
    /**
     * @event dataready
     * Fires on the grid panel when the {@link Ext.exporter.data.Table data} is ready.
     * You could adjust styles or data before the document is generated and saved.
     * @param {Ext.grid.Panel} grid Reference to the grid panel
     * @param {Object} params Additional parameters sent with this event
     * @param {Object} params.config The config object used in the {@link #saveDocumentAs} method
     * @param {Ext.exporter.Base} params.exporter A reference to the exporter object used to save the document
     */
    /**
     * Save the export file. This method is added to the grid panel as "saveDocumentAs".
     *
     * Pass in exporter specific configs to the config parameter.
     *
     * @method saveDocumentAs
     * @param {Ext.exporter.Base} config Config object used to initialize the proper exporter
     * @param {String} config.type Type of the exporter as defined in the exporter alias. Default is `excel`.
     * @param {String} [config.title] Title added to the export document
     * @param {String} [config.author] Who exported the document?
     * @param {String} [config.fileName] Name of the exported file, including the extension
     * @param {String} [config.charset] Exported file's charset
     *
     */
    /**
     * Fetch the export data. This method is added to the grid panel as "getDocumentData".
     *
     * Pass in exporter specific configs to the config parameter.
     *
     * @method getDocumentData
     * @param {Ext.exporter.Base} config Config object used to initialize the proper exporter
     * @param {String} [config.type] Type of the exporter as defined in the exporter alias. Default is `excel`.
     * @param {String} [config.title] Title added to the export document
     * @param {String} [config.author] Who exported the document?
     * @return {String}
     *
     */
    /**
     * @inheritdoc
     */
    prepareData: function(config) {
        var me = this,
            store = me.cmp.getStore(),
            table = new Ext.exporter.data.Table(),
            result, group, columns;
        result = me.getColumnHeaders(config, me.getGridColumns());
        table.setColumns(result.headers);
        group = table.addGroup({
            text: ''
        });
        columns = me.prepareDataIndexColumns(config, result.dataIndexes);
        if (config && config.includeGroups && store.isGrouped()) {
            me.extractData(config, group, columns, store.getGroups());
            me.extractSummaryRow(config, group, columns, store);
        } else {
            me.extractRows(config, group, columns, store);
        }
        return table;
    },
    /**
     *
     * @param config
     * @param columns
     * @return {Object}
     * @private
     */
    getColumnHeaders: function(config, columns) {
        var cols = [],
            dataIndexes = [],
            len = columns.length,
            i, result;
        for (i = 0; i < len; i++) {
            result = this.getColumnHeader(config, columns[i]);
            if (result) {
                cols.push(result.header);
                Ext.Array.insert(dataIndexes, dataIndexes.length, result.dataIndexes);
            }
        }
        return {
            headers: cols,
            dataIndexes: dataIndexes
        };
    },
    /**
     * Fetch grid column headers that will be processed
     *
     * @return {Ext.grid.column.Column[]}
     * @private
     */
    getGridColumns: function() {
        return [];
    },
    /**
     * Check if the column should be exported or not. Columns that are hidden or have ignoreExport = true are ignored.
     *
     * Returns an object that has 2 keys:
     * - header
     * - dataIndexes
     *
     * @param {Object} config
     * @param {Ext.grid.column.Column} column
     * @return {Object}
     * @private
     */
    getColumnHeader: Ext.emptyFn,
    prepareDataIndexColumns: function(config, dataIndexes) {
        var len = dataIndexes.length,
            columns = [],
            i;
        for (i = 0; i < len; i++) {
            columns.push(this.prepareDataIndexColumn(config, dataIndexes[i]));
        }
        return columns;
    },
    prepareDataIndexColumn: function(config, column) {
        return {
            column: column,
            fn: Ext.emptyFn
        };
    },
    /**
     * Fetch data from store groups.
     *
     * @param {Object} config
     * @param {Ext.exporter.data.Group} group
     * @param {Ext.grid.column.Column[]} columns
     * @param {Ext.util.GroupCollection} collection
     * @private
     */
    extractData: function(config, group, columns, collection) {
        var i, len, children, storeGroup, tableGroup;
        if (!collection) {
            return;
        }
        len = collection.getCount();
        for (i = 0; i < len; i++) {
            storeGroup = collection.getAt(i);
            children = storeGroup.getGroups();
            tableGroup = group.addGroup({
                text: storeGroup.getGroupKey()
            });
            if (children) {
                this.extractData(config, tableGroup, columns, children);
            } else {
                this.extractRows(config, tableGroup, columns, storeGroup);
            }
        }
    },
    /**
     *
     * @param {Object} config
     * @param {Ext.exporter.data.Group} group
     * @param {Ext.grid.column.Column[]} columns
     * @param {Ext.data.Store/Ext.util.Group} collection
     * @private
     */
    extractRows: function(config, group, columns, collection) {
        var cmp = this.cmp,
            store = cmp.getStore(),
            len = collection.getCount(),
            lenCols = columns.length,
            rows = [],
            i, j, record, row, cell;
        for (i = 0; i < len; i++) {
            record = collection.getAt(i);
            row = {
                cells: []
            };
            for (j = 0; j < lenCols; j++) {
                cell = this.getCell(store, record, columns[j]);
                row.cells.push(cell || {
                    value: null
                });
            }
            rows.push(row);
        }
        group.setRows(rows);
        this.extractSummaryRow(config, group, columns, collection);
    },
    extractSummaryRow: function(config, group, columns, collection) {
        var lenCols = columns.length,
            i, record, row, cell;
        if (config.includeSummary) {
            row = {
                cells: []
            };
            record = this.getSummaryRecord(collection, columns);
            for (i = 0; i < lenCols; i++) {
                cell = this.getSummaryCell(collection, record, columns[i]);
                row.cells.push(cell || {
                    value: null
                });
            }
            group.setSummaries(row);
        }
    },
    /**
     *
     * @param {Ext.data.Store} store
     * @param {Ext.data.Model} record
     * @param {Object} colDef
     * @param {String} colDef.dataIndex
     * @param {Ext.grid.column.Column} colDef.column
     * @param {Function} colDef.fn
     * @param {Function/String} colDef.summaryType
     * @param {Function} colDef.summaryFn
     * @return {Ext.exporter.data.Cell} A cell config object
     * @private
     */
    getCell: Ext.emptyFn,
    /**
     *
     * @param {Ext.data.Store/Ext.util.Group} collection
     * @param {Object} colDef
     * @param {Ext.grid.column.Column} colDef.column
     * @param {Function} colDef.fn
     * @return {Ext.exporter.data.Cell} A cell config object
     * @private
     */
    getSummaryCell: Ext.emptyFn,
    getSummaryRecord: function(collection, columns) {
        var len = columns.length,
            record = new Ext.data.Model({
                id: 'summary-record'
            }),
            i, colDef;
        record.beginEdit();
        for (i = 0; i < len; i++) {
            colDef = columns[i];
            record.set(colDef.dataIndex, this.getSummary(collection, colDef.summaryType, colDef.dataIndex));
        }
        record.endEdit();
        record.commit(true);
        return record;
    },
    /**
     * Get the summary data for a field.
     * @param {Ext.data.Store/Ext.util.Group} item The store or group to get the data from
     * @param {String/Function} type The type of aggregation. If a function is specified it will
     * be passed to the stores aggregate function.
     * @param {String} field The field to aggregate on
     * @return {Number/String/Object} See the return type for the store functions.
     * if the group parameter is `true` An object is returned with a property named for each group who's
     * value is the summary value.
     * @private
     */
    getSummary: function(item, type, field) {
        var isStore = item.isStore;
        if (type) {
            if (Ext.isFunction(type)) {
                if (isStore) {
                    return item.aggregate(type, null, false, [
                        field
                    ]);
                } else {
                    return item.aggregate(field, type);
                }
            }
            switch (type) {
                case 'count':
                    return item.count();
                case 'min':
                    return item.min(field);
                case 'max':
                    return item.max(field);
                case 'sum':
                    return item.sum(field);
                case 'average':
                    return item.average(field);
                default:
                    return null;
            }
        }
    }
});

/**
 * This plugin allows grid data export using various exporters. Each exporter should extend
 * the {@link Ext.exporter.Base} class.
 *
 * Two new methods are created on the grid panel by this plugin:
 *
 *  - saveDocumentAs(config): saves the document
 *  - getDocumentData(config): returns the document content
 *
 * The grid data is exported for all grid columns that have the flag
 * {@link Ext.grid.column.Column#ignoreExport ignoreExport} as false.
 *
 * If the grid store is grouped and you want the export to group your results
 * then use the following properties in the config object sent to the `saveDocumentAs` function:
 *
 * - includeGroups: set to true to include the groups
 * - includeSummary: set to true to include also group/grand summaries if proper `summaryType` was defined on columns
 *
 * During data export the data for each column could be formatted in multiple ways:
 *
 * - using the {@link Ext.grid.column.Column#exportStyle exportStyle} format
 * - using the {@link Ext.grid.column.Column#formatter formatter} if no `exportStyle` is defined
 * - using the {@link Ext.grid.column.Column#exportRenderer exportRenderer}
 *
 * If `exportStyle.format`, `formatter` and `exportRenderer` are all defined on a column then the `exportStyle.format`
 * wins and will be used to format the data for that column.
 *
 * Example usage:
 *
 *      {
 *          xtype: 'grid',
 *          plugins: [{
 *              type: 'gridexporter'
 *          }],
 *          columns: [{
 *              dataIndex: 'value',
 *              text: 'Total',
 *              exportStyle: {
 *                  format: 'Currency',
 *                  alignment: {
 *                      horizontal: 'Right'
 *                  }
 *              }
 *          }]
 *      }
 *
 *      grid.saveDocumentAs({
 *          type: 'xlsx',
 *          title: 'My export',
 *          fileName: 'myExport.xlsx'
 *      });
 *
 */
Ext.define('Ext.grid.plugin.Exporter', {
    alias: [
        'plugin.gridexporter'
    ],
    extend: 'Ext.grid.plugin.BaseExporter',
    getGridColumns: function() {
        return this.cmp.getHeaderContainer().innerItems;
    },
    getColumnHeader: function(config, column) {
        var dataIndexes = [],
            obj, result, style;
        obj = {
            text: column.getText(),
            width: column.getWidth()
        };
        if (column.isHeaderGroup) {
            result = this.getColumnHeaders(config, column.innerItems);
            obj.columns = result.headers;
            if (obj.columns.length === 0) {
                // all children columns are ignored for export so there's no need to export this grouped header
                obj = null;
            } else {
                Ext.Array.insert(dataIndexes, dataIndexes.length, result.dataIndexes);
            }
        } else if (!column.getHidden() && !column.getIgnoreExport()) {
            style = this.getExportStyle(column.getExportStyle(), config);
            obj.style = style;
            // width could also be specified in the exportStyle but will not be used by the style itself
            obj.width = obj.width || column.getComputedWidth();
            if (style) {
                obj.width = style.width || obj.width;
            }
            dataIndexes.push(column);
        } else {
            obj = null;
        }
        if (obj) {
            return {
                header: obj,
                dataIndexes: dataIndexes
            };
        }
    },
    prepareDataIndexColumn: function(config, column) {
        var fn = Ext.identityFn,
            summaryFn = Ext.identityFn,
            style = this.getExportStyle(column.getExportStyle(), config);
        // if there is an exportStyle format then we use that one
        if (!style || (style && !style.format)) {
            fn = this.getSpecialFn({
                renderer: 'renderer',
                exportRenderer: 'exportRenderer',
                formatter: 'formatter'
            }, column);
            summaryFn = this.getSpecialFn({
                renderer: 'summaryRenderer',
                exportRenderer: 'exportSummaryRenderer',
                formatter: 'summaryFormatter'
            }, column);
        }
        return {
            dataIndex: column.getDataIndex(),
            column: column,
            fn: fn,
            summaryType: column.getSummaryType(),
            summaryFn: summaryFn
        };
    },
    getSpecialFn: function(names, column) {
        var fn = Ext.identityFn,
            exportRenderer = column['get' + Ext.String.capitalize(names.exportRenderer)](),
            renderer = column['get' + Ext.String.capitalize(names.renderer)](),
            formatter = column['get' + Ext.String.capitalize(names.formatter)](),
            scope, tempFn;
        scope = column.getScope() || column.resolveListenerScope() || column;
        tempFn = exportRenderer;
        if (formatter && !tempFn) {
            fn = formatter;
        } else {
            if (tempFn === true) {
                tempFn = renderer;
            }
            if (typeof tempFn == 'string') {
                fn = function() {
                    return Ext.callback(tempFn, scope, arguments, 0, column);
                };
            } else if (typeof tempFn == 'function') {
                fn = function() {
                    return tempFn.apply(scope, arguments);
                };
            }
        }
        return fn;
    },
    getCell: function(store, record, colDef) {
        var dataIndex = colDef.dataIndex,
            v = record.get(dataIndex);
        return {
            value: colDef.fn(v, record, dataIndex, null, colDef.column)
        };
    },
    getSummaryCell: function(collection, record, colDef) {
        var dataIndex = colDef.dataIndex,
            v = record.get(dataIndex);
        return {
            value: colDef.summaryFn(v, record, dataIndex, null, colDef.column)
        };
    }
});

