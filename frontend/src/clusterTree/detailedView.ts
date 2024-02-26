import { BackendCommunicator } from "../BackendCommunicator";
import { generateUUID, appendBadgeElement, reformatAttributes, loadGraph } from "../utils";
import { TreeNode } from "./node";
import { Tree } from "./tree";


/**
 * Class for visualizing and managing the visualization and interactions with a selected node
 */
export class DetailedView {

    //connected Tree
    tree: Tree;
    //flag signifies if cluster analysis is already initialized (data set loaded, algorithm selected, ...)
    isInit: boolean = false;


    constructor(tree: Tree) {
        this.tree = tree;
    }

    /**
     * Propagates Attribute Dropdown-Menus for Graph Visualization
     */
    initVisAttributeDropdown() {
        let attributes = this.tree.getAttributes();
            let attSelect = document.getElementById("graphAttDropdown_" + "0");
            document.forms["GraphForm_" + "0"].elements["graphAttDropdown_" + "0"].options.length = 0;
            for (let a of reformatAttributes(attributes)) {
                attSelect.append(new Option(a['name'], a['value']));
        }
        //initialize data table
        this.initDataTable();
        this.isInit = true;
    }

    /**
     * Sets up Table to directly view the data of a selected node, as well as interactions listeners
     */
    initDataTable() {
        let self = this;
        if (this.isInit) {
            return;
        }
        //get data and attributes of table
        let atts = this.tree.attributes;
        let table_columns: any[] = [];
        table_columns.push({
            field: "un_row_id_random12345613",
            title: "id",
            sortable: true
        },
            {
                field: "cluster_assignment",
                title: "Cluster",
                sortable: true,
                formatter: (value, row, index) => this.clusterAssignementFormatter(value, row),
                // formatter: (value, row, index) => {
                //     return '<button class=\'btn btn-primary \' item-id="'+ row["un_row_id_random12345613"] + '">'+ value +'</button> ';
                // }
            },
        )
        for (let i = 0; i < atts.length; i++) {
            table_columns.push({
                field: atts[i],
                title: atts[i],
                sortable: true
            })
        }
        //append table to dom
        let template = require('../templates/interClust/dataTable.hbs');
        let rendered = template({
            //attributes: this.tree.attributes,
        });
        $("#detailedInfDataTabContainer").append(rendered);
        //use bootstrap table to initialize interactive functions for table
        (<any>$('#detailedInfoDataTable')).bootstrapTable({
            data: [],
            columns: table_columns,
            onAll: () => {self.handleTableChange()}
        });
        //disable selection of hidden column
        //$("#detailedInfDataTabContainer").find("[data-field='un_row_id_random12345613']").parent().hide();
        //$("#detailedInfDataTabContainer tr :nth-child(1)").css("display", "none");
    }

    /**
     * handle changes in table (reinitialize dropdowns, refresh colors, ...)
     */
    handleTableChange() {
        //activate dropdown
        (<any>$('.selectpicker')).selectpicker();
        //refresh colors
        this.refreshTableColor();
        //set selection listener
        this.setTableClustChangeSelect();
    }

    /**
     * Generates selection menu that allows the manual assignment of data instances in the table to specified clusters
     * @param val Node id
     * @param row Unique row id of data instance
     * @returns rendered selection menu
     */
    clusterAssignementFormatter(val, row) {
        // try {
        if (val == "-") {
            return '<button class=\'btn btn-primary \'>-</button> ';
        }
        else {
            let backendRowId = row.un_row_id_random12345613
            let cluster_opts: any[] = []
            let clusterNode = this.tree.getNodeById(val).parentNode
            let clusters = clusterNode.getChildren();
            let selected_name = this.tree.getNodeById(val).name;
            for (let i = 0; i < clusters.length; i++){
                if (clusters[i].id != val) {
                    cluster_opts.push([clusters[i].id, clusters[i].name])
                }
            }
            let template = require('../templates/interClust/util_elements/clusterAssignmentDropdown.hbs');
            let rendered = template({
                row_id: backendRowId,
                selected: [val, selected_name],
                clusters: cluster_opts,
            });
            return rendered;
        }
        // }
        // catch (error) {
        //     return String(error);
        // }

    }
    
    /**
     * Update cluster selection menus of graphs and others statistic visualization
     * @param nodes possible sub clusters (sub nodes)
     * @param updateDataTable if complete data table should be updated
     * @returns 
     */
    updateClusterSelection(nodes: TreeNode[], updateDataTable: boolean = true) {
        if (this.tree.getSelectedNode().isRoot()) {
            console.log("root update selection called")
        }
        if (!this.isInit) {
            return;
        }
        let self = this;
        $("#currentDetailedViewClustName").html(self.tree.getSelectedNode().name)
        //cluster visualisation
        this.hideComponents(false);
        this.refreshClusterComponent().then(() => {
            let id = 0
            let cluSelect = document.getElementById("clusterDropdown_" + id);
            document.forms["GraphForm_" + id].elements["clusterDropdown_" + id].options.length = 0;
            for (let i= 0; i < nodes.length; i++) {
                cluSelect.append(new Option(nodes[i].name, nodes[i].id))
            }
            $("#componentContainer").show();
            if (nodes.length == 0) {
                $("#graphDiv_0").hide()
                //update cluster info section
                this.updateInfoSection(false);
            }
            else {
                $("#graphDiv_0").show()
                //update cluster info section
                this.updateInfoSection(true);
            }
            self.initVisAttributeDropdown()
            loadGraph(id);
            //fix for histo size
            $(".histogramDivClass").css("width", "400px");
        })
        //update statistics table
        this.updateStatistics();
        //update Recommendations
        this.requestActiveQuery();
        this.calcRecommendUserPreference();
        if (updateDataTable) {
            //update data Table
            this.requestNewDataTable();
        }
    }

    /**
     * request new data table information from backend
     */
    requestNewDataTable() {
        //request data for node from backend to create data table
        let msg = JSON.stringify({
            "node_id": this.tree.getSelectedNode().id,
            "instance_id": BackendCommunicator.getInstance().instance_id,
        });
        BackendCommunicator.getInstance().client.publish("clustering_communicator/backend/get_data_table", msg);
    }

    /**
     * Calculates recommendations for selected cluster
     * @param recommend_limit max number of recommendations
     */
    calcRecommendUserPreference(recommend_limit: number = 1) {
        $(".weightRecommnedElem").remove();
        if (this.tree.getSelectedNode().childNodes.length < 2) {
            return;
        }
        //['Frisch', 'Lebensmittel', 'Diverse', 'Tiefkühl']
        let relAtts = this.tree.getSelectedNode().relAttsClustering;
        //[1, 1, 1, 1, 1, 1, 1, 1, 1]
        let currWeights = this.tree.getSelectedNode().attWeights ? this.tree.getSelectedNode().attWeights : [];
        let relImportanceSortOrder = this.tree.getSelectedNode().relImportanceSortOrder;
        let attributes = this.tree.getSelectedNode().attributes;
        console.error("in calc recommend user preference")
        console.error(relAtts)
        console.error(attributes)
        console.error(currWeights)
        console.error(relImportanceSortOrder)
        //collect attributes with strong positive/negative weighting
        let posWeightAttIndices: any[] = []
        let negWeightAttIndices: any[] = []
        for (let i = 0; i < currWeights.length; i++) {
            if (currWeights[i] >= 2) {
                posWeightAttIndices.push([i, currWeights[i]])
            }
            else if (currWeights[i] <= 0.5) {
                negWeightAttIndices.push([i, currWeights[i]])
            }
        }
        let recommended_count = 0
        //check if weighting preference is reflected in feature importance
        for (let i = 0; i < posWeightAttIndices.length; i++) {
            //big weight --> expectation is it should be in very relevant features
            let attribute = attributes[posWeightAttIndices[i][0]];
            let found = false;
            for (let j = 0; j < relAtts.length; j++) {
                if (attribute==relAtts[j]) {
                    found = true;
                }
            }
            if (found == false && recommended_count<recommend_limit) {
                this.recommendWeightPreference(attribute,posWeightAttIndices[i][1])
                recommended_count += 1;
            }
        }

        for (let i = 0; i < negWeightAttIndices.length; i++) {
            //small weight --> expectation is it should be in very relevant features
            let attribute = attributes[posWeightAttIndices[i][0]];
            let found = false;
            for (let j = 0; j < relAtts.length; j++) {
                if (attribute==relAtts[j]) {
                    found = true;
                }
            }
            if (found == true && recommended_count<recommend_limit) {
                this.recommendWeightPreference(attribute,posWeightAttIndices[i][1])
                recommended_count += 1;
            }
        }
    }

    /**
     * Creates recommendation dialog for the adjustment of attribut weights
     * @param attribute Attribute for which recommendation is generated
     * @param weight Current weight of the attribute
     */
    recommendWeightPreference(attribute: string, weight: number) {
        let self = this;
        let id = generateUUID()
        let text = ""
        if (weight > 1) {
            text = `Das Attribut '${attribute}' wird derzeit mit erhöhter Gewichtung <b>${weight}-fach</b> gewichtet, nimmt jedoch <b>keinen bedeutenden Einfluss</b> auf die Aufteilung der Daten.`
        }
        else if (weight < 1) {
            text = `Das Attribut '${attribute}' wird derzeit mit niedriger Gewichtung <b>${weight}-fach</b> gewichtet, nimmt jedoch <b>einen bedeutenden Einfluss</b> auf die Aufteilung der Daten.`
        }
        console.error(text)
        let template = require('../templates/interClust/userPreferenceRecommend.hbs');
        let rendered = template({
            att: attribute,
            text: text,
            id: id
        });
        rendered = $.parseHTML(rendered)
        $("#detailsRecommendationContainer").append(rendered);
        $("#" + id + " .btn-adj-weight").on("click", () => { 
            self.tree.getSelectedNode().handleWeightChangeEv()
        });
    }

    /**
     * Update data table with new data from backend
     * @param msg backend msg containing new data as payload
     */
    updateDataTable(msg) {
        let n_data = JSON.parse(msg["table_data"])
        let node_id = msg["node_id"]
        if (node_id != this.tree.getSelectedNode().id) {
            return;
        }
        (<any>$('#detailedInfoDataTable')).bootstrapTable("load", n_data);
        //(<any>$('.selectpicker')).selectpicker();
        this.refreshTableColor();
        this.setTableClustChangeSelect();
    }

    /**
     * sets manual cluster assignment on change listeners for select elements
     */
    setTableClustChangeSelect() {
        let self = this;
        (<any>$('.selectpicker')).on('changed.bs.select', (e, clickedIndex, isSelected, previousValue) => { 
            //console.warn("selection on click triggered")
            let elem = $(e.target).find("option")[clickedIndex];
            let clust_id = $(elem).attr("clust_id");
            let backend_row_id = $(elem).parent().attr("backend_row_id");
            //send reassignemnt to backend
            let msg = JSON.stringify({
                "node_id": self.tree.getSelectedNode().id,
                "instance_id": BackendCommunicator.getInstance().instance_id,
                "assigned_cluster": clust_id,
                "backend_row_id": backend_row_id,
            });
            BackendCommunicator.getInstance().client.publish("clustering_communicator/backend/reassign_instance_clust", msg);
        });
    }

    /**
     * refreshes the color of rows in the data table
     */
    refreshTableColor() {
        let children = this.tree.getSelectedNode().getChildren();
        for (let i = 0; i < children.length; i++) {
            let color = children[i].nodeColor;
            $("#detailedInfoDataTable > tbody > tr > td:nth-child(2) > div :selected[clust_id='"+ children[i].id +"']").parent().parent().parent().parent().css("background-color", color);
        }
    }

    /**
     * updates statistics of selected cluster
     */
    updateStatistics() {
        let stat_sum = this.tree.getSelectedNode().stat_sum
        if (stat_sum != undefined && stat_sum.length > 0) {
            let statMetricsUsed = [["Anzahl", true], ["Durchschn.", true], ["Std. Abweichung", true], ["Minimum", true], ["Quartil (25%)", true], ["Quartil (50%)", true], ["Quartil (75%)", true], ["Maximum", true]];
            let stat_sum_edited: any[] = []
            for(let i = 0; i < stat_sum.length; i++){
                if (statMetricsUsed[i][1]) {
                    stat_sum[i]["description"] = statMetricsUsed[i][0]
                    stat_sum_edited.push(stat_sum[i])
                }
            }
            $("#statTableContainer").empty();
            let template = require('../templates/interClust/statTable.hbs');
            let rendered = template({
                attributes: this.tree.getSelectedNode().attributes,
            });
            $("#statTableContainer").append(rendered);
            (<any>$('#statTable')).bootstrapTable({
                data: stat_sum_edited
            });
            $("#statTable tbody tr :nth-child(1)").css("text-shadow", "0.5px 0px 0.5px black");
        }
    }

    /**
     * Updates Information section of selected cluster
     * @param with_q_indi if quality indices should be included in generated info section (should be false for leaf nodes)
     * @returns 
     */
    updateInfoSection(with_q_indi: boolean) {
        let s_node = this.tree.getSelectedNode()
        let relParent = "100%"
        if (!s_node.isRoot()) {
            relParent = String(s_node.num_instances / s_node.parentNode.num_instances*100).substring(0, 5) + "%"
        }
        //general information
        let generalInfo = [["Hierarchie Ebene", this.tree.getSelectedNode().getHierarchyLevel(), "Die Zahl der Knoten (Clustering-Verfahren) die diesem Knoten vorangehen"],
            ["Anzahl der Instanzen im Cluster", s_node.num_instances, "Anzahl der Instanzen die in diesem Cluster enthalten sind"],
            ["Anzahl relativ zur Gesamtanzahl", String(s_node.num_instances / this.tree.rootNode.num_instances*100).substring(0, 5) + "%", "Prozentualer Anteil der Instanzen aus dem gesamten Datensatz, welche diesem CLuster zugewiesen sind"], 
            ["Anzahl relativ zum Elternknoten", relParent, "Prozentualer Anteil der Instanzen aus Elternknoten, welche diesem CLuster zugewiesen sind"]
        ]
        $("#informationContainer").empty();
        let template1 = require('../templates/interClust/util_elements/qualityIndicatorElement.hbs');
        let rendered1 = template1({
            metrics: generalInfo
        });
        $("#informationContainer").append(rendered1);
        if (with_q_indi) {
            //quality indicators
            let qIndikatorList = this.tree.getSelectedNode().qualityIndiList;
            //every index to max 3 decimals
            for (let i = 0; i < qIndikatorList.length; i++) {
                let indi_str = String(qIndikatorList[i][1]);
                if (indi_str.search(".") !== -1) {
                    let p_index = indi_str.search(".");
                    indi_str = indi_str.slice(0, p_index + 3);
                }
                qIndikatorList[i][1] = indi_str;
            }
            if (qIndikatorList.length == 0) {
                return;
            }
            $("#infoSectionContentContainer").empty();
            let template = require('../templates/interClust/util_elements/qualityIndicatorElement.hbs');
            let rendered = template({
                metrics: qIndikatorList
            });
            $("#infoSectionContentContainer").append(rendered);
            $("#q_indi_title_h4").show()
        }
        else {
            $("#q_indi_title_h4").hide()
        }
        $("body").tooltip({ selector: '[data-toggle=tooltip]' });
    }

    /**
     * request new active query from backend
     */
    requestActiveQuery() {
        $("#activeLRecommend").remove();
        $("#activeLRecommend").remove();
        $("#activeLRecommend").remove();
        if (this.tree.getSelectedNode().getChildren().length > 1) {
            let msg = JSON.stringify({
                "node_id": this.tree.getSelectedNode().id,
                "instance_id": BackendCommunicator.getInstance().instance_id,
            });
            BackendCommunicator.getInstance().client.publish("clustering_communicator/backend/request_active_query", msg);
        }
    }

    /**
     * update system recommendations for selected cluster
     * @param message message from bakckend containing recommendation info
     */
    updateRecommendations(message) {
        //remove existing recommendations
        $("#activeLRecommend").remove();
        $("#activeLRecommend").remove();
        let self = this;
        let query = message["query_data"];
        let node = this.tree.getSelectedNode();
        //get attributes
        let attributes = node.attributes
        //sort attributes and data in order of importance
        let relSortedQuery: any[] = [];
        let relSortedAttributes: any[] = [];
        let sortedQuery: any[] = [];
        let sortedAttributes: any[] = [];
        for (let i = 0; i < node.relImportanceSortOrder.length; i++) {
            if (node.attIsInRelevantAtts(attributes[node.relImportanceSortOrder[i]])) {
                relSortedAttributes.push(attributes[node.relImportanceSortOrder[i]]);
                relSortedQuery.push([query[0][node.relImportanceSortOrder[i]], query[1][node.relImportanceSortOrder[i]]]);
            }
            else {
                sortedAttributes.push(attributes[node.relImportanceSortOrder[i]]);
                sortedQuery.push([query[0][node.relImportanceSortOrder[i]], query[1][node.relImportanceSortOrder[i]]]);
            }
        }
        //if no relevant attributes to describe just display all data
        if (relSortedAttributes.length == 0) {
            relSortedAttributes = sortedAttributes;
            relSortedQuery = sortedQuery;
        }
        //generate recommendation template
        let template = require('../templates/interClust/pairwiseRecom.hbs');
        let rendered = template({
            relSortedAttributes: relSortedAttributes,
            sortedAttributes: sortedAttributes,
            relQuery: relSortedQuery,
            unRelQuery: sortedQuery
        });
        $("#detailsRecommendationContainer").append(rendered);
        $("#recommendActiveQTableContainer").on("mouseenter", () => { 
            $(".compareIrrelevantClass").show();
        });
        $("#recommendActiveQTableContainer").on("mouseleave", () => { 
            $(".compareIrrelevantClass").hide();
        });
        $("#btnSameClust").on("click", () => { 
            self.actQueryAnswered(true);
        });
        $("#btnDiffClust").on("click", () => { 
            self.actQueryAnswered(false);
        });
    }

    /**
     * handles the answer of an active query by a user
     * @param answ the answer given by the user
     */
    actQueryAnswered(answ: boolean) {
        //console.log("q_answer")
        let msg = JSON.stringify({
            "node_id": this.tree.getSelectedNode().id,
            "instance_id": BackendCommunicator.getInstance().instance_id,
            "q_answer": answ
        });
        BackendCommunicator.getInstance().client.publish("clustering_communicator/backend/q_answer", msg);
        $("#activeLRecommend").remove();
        $("#activeLRecommend").remove();
    }
    

    refreshClusterComponent() {
        return BackendCommunicator.getInstance().components[0].createNewGraphComponent();
    }

    /**
     * hides/shows statistics and graph components
     * @param b true for hidden false for visible
     */
    hideComponents(b: boolean) {
        document.getElementById("graphDiv_1").hidden = b;
        document.getElementById("clusterInfoDiv_1").hidden = b;
        document.getElementById("graphDiv_2").hidden = b;
        document.getElementById("clusterInfoDiv_2").hidden = b;
    }

}