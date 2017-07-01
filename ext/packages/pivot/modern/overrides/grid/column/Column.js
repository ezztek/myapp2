Ext.define('Ext.overrides.grid.column.Column', {
    override: 'Ext.grid.column.Column',

    config: {
        sortDirection: null
    },

    updateSortDirection: function(direction) {
        this.setSortState(direction);
    }
});