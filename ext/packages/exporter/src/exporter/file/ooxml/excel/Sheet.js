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

    destroy: function(){
        this.callParent();
        this.setWorkbook(null);
    },

    updateIndex: function(){
        this.generateName();
        this.callParent(arguments);
    },

    applyName: function(value){
        // Excel limits the worksheet name to 31 chars
        return Ext.String.ellipsis(String(value), 31);
    }


});