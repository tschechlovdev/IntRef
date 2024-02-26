import { BackendCommunicator } from "../BackendCommunicator";
import { generateUUID, appendBadgeElement, getContextMenuPosition } from "../utils";
import { Tree } from "./tree";
import{TreeConfiguration} from "./tree_const";

/**
 * Class represents a singular node/cluster of the created cluster hierarchie.
 * Manages information about node content aswell as interactions with the node.
 */
export class TreeNode {

    id: string;
    //overarching tree this node is part of
    tree: Tree;
    name: string;
    htmlElem: any = null;
    //rgb color code like rgb(255, 255, 255)
    nodeColor: string;
    //data included in this cluster node
    dataPts: Array<any> = [];
    parentNode: TreeNode;
    childNodes: Array<TreeNode> = [];
    //offset relative to parent
    offTop: number = 0;
    offLeft: number = 0;
    //statistical summary of data contained in node
    stat_sum: any;
    //position
    position: any;
    //used to check if incoming messages are refering to most uptodate node version
    version: string;
    //attributes contained in node data
    attributes: string[] = [];
    //Attributes relevant to describe cluster
    relAttsIntern: string[] = [];
    //Attributes relevant for splitting data into multiple clusters
    relAttsClustering: string[] = [];
    relImportanceSortOrder: number[] = [];
    attWeights: number[]|null|undefined;
    numClusters: number = 0; //param K of underlying PCKmeans algorithm
    qualityIndiList: any[] = [];
    //Constraints set in hierarchical view that restrict the cluster assignment
    //--> format [["attribute", "<|>|=", "value"], ...]
    hierRestrictions: any[] = [];
    //number of instances contained in cluster
    num_instances: number = 0;
    //height of node ui element
    nodeHeight: number = 315;

    constructor(parentNode: TreeNode | null, tree: Tree, immediate_calc: boolean=true) {
        this.tree = tree;
        this.position = { left: 0, top: 0 };
        //set parent node
        if (parentNode instanceof TreeNode && parentNode!=null) {
            this.parentNode = parentNode;
        }
        //if root node just place otherwise place relative to parent and number of children
        if (this.isRoot()) {
            this.name = "root";
            this.id = "root";
            let msg = JSON.stringify({
                "root_id": this.id,
                "instance_id": BackendCommunicator.getInstance().instance_id,
            });
            BackendCommunicator.getInstance().client.publish("clustering_communicator/backend/register_root", msg);
            ////console.log("appending root node")
            let template = require('../templates/interClust/treeNode.hbs');
            let rendered = template({
                id: this.id,
                name: this.getPresentableName(),
                splits: 0
            });
            document.getElementById("clusterHierarchieTree").insertAdjacentHTML('beforeend', rendered);
            this.htmlElem = document.getElementById(this.id)
            this.setOnclick();
            this.centerNode();
        }
        //is not root node
        else {
            this.id = generateUUID();
            this.name = this.id.substring(0, 5)
            let msg = JSON.stringify({
                "node_id": this.id,
                "instance_id": BackendCommunicator.getInstance().instance_id,
                "node_name": this.name,
                "parent_id": this.getParent().id,
                "immidiate_calc": immediate_calc,
            });
            BackendCommunicator.getInstance().client.publish("clustering_communicator/backend/add_node", msg);
            let template = require('../templates/interClust/treeNode.hbs');
            let rendered = template({
                id: this.id,
                name: this.getPresentableName(),
                splits: 0
            });
            document.getElementById("clusterHierarchieTree").insertAdjacentHTML('beforeend', rendered);
            this.htmlElem = document.getElementById(this.id)
            this.setOnclick();
        }
        //document.getElementById("fillerDiv").insertAdjacentHTML('afterend', rendered);
        this.version = generateUUID();
        this.htmlElem.style.position = "absolute";
        this.setRandomNodeColor();
    }

    /**
     * Check if instance is root node
     * @returns true if node is root node of tree
     */
    isRoot(): boolean {
        return (this.parentNode == undefined);
    }

    /**
     * Get parent of node
     * @returns parent node or none
     */
    getParent(): TreeNode {
        if (this.isRoot()) {
            return this
        }
        else {
            return this.parentNode;
        }
    }

    /**
     * Get child nodes of instance
     * @returns array of children
     */
    getChildren(): TreeNode[] {
        return this.childNodes;
    }

    /**
     * Get siblings of instance
     * @returns list of siblings
     */
    getSiblings(): TreeNode[] {
        return this.getParent().getChildren();
    }

    /**
     * Get root node of tree
     * @returns root node
     */
    getRoot(): TreeNode {
        if (!this.isRoot()) {
            return this.getParent().getRoot();
        }
        else {
            return this
        }
    }

    /**
     * Assigns a random color to the tree node
     */
    setRandomNodeColor() {
        let r = Math.floor(Math.random() * (255 - 0) + 0)
        let g = Math.floor(Math.random() * (255 - 0) + 0)
        let b = Math.floor(Math.random() * (255 - 0) + 0)
        this.nodeColor = "rgb(" + r + "," + g + "," + b + ")"
        //set in html elem
        $("#" + this.id + " .nodeColor").css("background-color", this.nodeColor);
    }

    /**
     * updates node with description of current content and related clustering process
     */
    updateNodeInformation(info: object): void {
        if (this.isRoot()) {
            console.log("root update node info")
        }
        //console.warn("updating node information")
        this.attributes = info["attributes"];
        if (this.tree.attributes.length == 0) {
            this.tree.attributes = this.attributes;
            this.tree.initAttDrop();
        }
        if (this.attWeights == undefined) {
            this.attWeights = Array(this.attributes.length).fill(1)
        }
        //update information on quantity of cluster instances bot absolute and relative
        this.updateQuantityInformation(info);
        //update quality indicators
        this.updateQualityIndicators(info);
        //update information on relevant features
        this.updateRelevantFeatures(info);
        //update detailed information
        this.updateSummaryInformation(info);
        //if tree is seleceted update tree version id of selected
        this.updateSelectedVersionIfApply();
    }

    /**
     * Stores summary information of node content
     * @param info node info received from backend
     */
    updateSummaryInformation(info: object): void {
        this.stat_sum = JSON.parse(info["stat_summary"]);
    }

    /**
     * Version of node (changes with edit of node)
     */
    updateSelectedVersionIfApply(): void {
        if (this.tree.getSelectedNode() != undefined && this.id == this.tree.getSelectedNode().id) {
            this.tree.changeSelectedNodeVersion();
        }
    }

    /**
     * Updates stored quality information of node
     * @param info quality information received from backend
     */
    updateQualityIndicators(info: object): void {
        //update indicator local to node in hierarchie visualisation
        let q_ind = info["quality_indicator"]
        q_ind = String(q_ind).substring(0, 4)
        // if (q_ind == "-") {
        //     $("#" + this.id + " .quality_ind").parent().hide()
        // }
        // else {
        //     $("#" + this.id + " .quality_ind").parent().show()
        // }
        $("#" + this.id + " .quality_ind").text(q_ind)
        //save list of calculated indicators in case domain expert wants detailed view of node
        this.qualityIndiList = info["quality_indicator_list"]
    }

    /**
     * Updates stored quantitative information about node content
     * @param info quantity information received from backend
     */
    updateQuantityInformation(info: object): void {
        let rel_instances = info["relative_num_instances"]
        if (rel_instances != "-") {
            //convert to %
            rel_instances *= 100
            rel_instances = String(rel_instances).substring(0, 4) + "%"
            $("#" + this.id + " .instance_rel").parent().show()
        }
        // else {
        //     $("#" + this.id + " .instance_rel").parent().hide()
        // }
        $("#" + this.id + " .instance_rel").text(rel_instances)
        $("#" + this.id + " .instance_absol").text(info["num_instances"])
        this.num_instances = info["num_instances"];
    }

    /**
     * Updates stored information about identified relevant features
     * @param info identified relevant features information received from backend
     */
    updateRelevantFeatures(info: object): void {
        //remove existing information on relevant attributes both for inside cluster and cluster process itself
        $("#" + this.id + " .importantFeatures .feature_container").empty()
        //add current relevant features
        let rel_inside_clust_selector = "#" + this.id + " .importantFeatures .rel_clu";
        let rel_between_clust_selector = "#" + this.id + " .importantFeatures .rel_div";
        let rel_ins_badge_cont = info["important_features_within_clust"]; //["Sex(F=1)", "Score", "Age", "Major"]
        this.relAttsIntern = rel_ins_badge_cont;
        let rel_bet_badge_cont = info["important_features_between_cluster"];
        this.relAttsClustering = rel_bet_badge_cont;
        this.relImportanceSortOrder = info["sorted_feature_importance_indice"];
        let thresholds_within = info["important_within_thresholds"];
        let thresholds_between = info["important_between_thresholds"];
        for (let i = 0; i < rel_ins_badge_cont.length; i++){
            if (thresholds_within[i][0] != "-") {
                let badge_string = rel_ins_badge_cont[i] + ": " + thresholds_within[i][0] + "-" + thresholds_within[i][1];
                appendBadgeElement(rel_inside_clust_selector, badge_string, "warning");
            }
            else {
                appendBadgeElement(rel_inside_clust_selector, rel_ins_badge_cont[i], "warning");
            }
        }
        for (let i = 0; i < rel_bet_badge_cont.length; i++){
            if (thresholds_between[i][0] != "-") {
                let badge_string = rel_bet_badge_cont[i] + ": " + thresholds_between[i][0] + "-" + thresholds_between[i][1];
                appendBadgeElement(rel_between_clust_selector, badge_string, "warning");
            }
            else {
                appendBadgeElement(rel_between_clust_selector, rel_bet_badge_cont[i], "warning");
            }
        }
        if (rel_ins_badge_cont.length == 0) {
            let elem = $('<span/>').text("-");
            $(rel_inside_clust_selector).append(elem);
        }
        if (rel_bet_badge_cont.length == 0) {
            let elem = $('<span/>').text("-");
            $(rel_between_clust_selector).append(elem);
        }
    }

    /**
     * Get width of ui element of node
     * @returns width
     */
    getWidth(): number {
        return this.htmlElem.getBoundingClientRect().width;
    }

    /**
     * Get height of ui element of node
     * @returns height
     */
    getHeight(): number {
        //console.error("html elem: "+ this.id + " height is: " + this.htmlElem.getBoundingClientRect().height)
        return this.htmlElem.getBoundingClientRect().height;
    }

    /**
     * sets position of tree node in px
     */
    setPosition(left: number, top: number): void {
        this.position.left = left;
        this.position.top = top;
        this.htmlElem.style.left = left+"px";
        this.htmlElem.style.top = top+"px";
    }

    /**
     * Get position of node ui element
     * @returns position
     */
    getPosition() {
        return this.position;
    }

    /**
     * centers node ui element used for root node
     */
    centerNode(): void {
        let position = this.htmlElem.getBoundingClientRect();
        let parentWidth = this.htmlElem.parentNode.parentNode.scrollWidth;
        let width = position.width;
        this.setPosition((parentWidth / 2) - (width / 2), position.top);
        let self = this;
        setTimeout(() => {
            self.htmlElem.scrollIntoView({
                behavior: 'auto',
                block: 'nearest',
                inline: 'center'
            });
        }, 200)
    }

    /**
     * Recursively removes node selection from all nodes in tree.
     * Used to clear old selection if user wants to set focus to a new node.
     */
    removeSelection(node: TreeNode): void {
        $("#" + node.id).removeClass("highlightCluster");
        if (node.childNodes.length > 0) {
            for (let i = 0; i < node.childNodes.length; i++){
                node.removeSelection(node.childNodes[i]);
            }
        }
    }

    //adds new childnode and rebalances distance between siblings
    addNode(rebalance: boolean = true): void {
        let n_node = new TreeNode(this, this.tree);
        this.childNodes.push(n_node);
        //initialize top offset
        n_node.offTop = TreeConfiguration.DEFAULT_NODE_DIST_TOP;
        //n_node.calcPosition();
        //rebalance
        this.rebalance(n_node.tree.rootNode);
        n_node.applyParentTransform();
        //this.tree.adjustDragDropScrollWidth();
        this.tree.recursiveConnectionLineUpdate(n_node.tree.rootNode);
        //n_node.drawConnection();
    }

    /**
     * removes node ui element from dom
     */
    removeSelfFromDom(): void {
        $("#" + "connection_to_parent_of_" + this.id).remove();
        $("#" + "connection_to_parent_of_" + this.id).remove();
        $("#" + this.id).remove()
    }

    /**
     * recursively rebalances ui elemnts of tree so that parent node is in center
     * also keeps manually (drag and drop) applied offsets
     * @param node node to rebalance
     */
    rebalance(node: TreeNode): void {
        let children = node.getChildren();
        for (let i = 0; i < children.length; i++) {
            children[i].calcPosition();
            this.rebalance(children[i]);
        }
    }

    /**
     * apply transformation of ui position (drag and drop) to ui element
     */
    applyParentTransform() {
        //apply transform of parent
        let trans = this.getParent().getDragDropTransform();
        this.addToTransform(trans[0], trans[1]);
    }

    /**
     * calculate the position of the ui element
     */
    calcPosition() {
        //get initial position from parent
        let position = this.getParent().getPosition();
        let initLeft = position.left;
        let parentWidth = this.getParent().getWidth();
        ////console.log("init left is: " + initLeft);
        ////console.log(this.getParent())
        let initTop = position.top + this.getParent().getHeight();
        //final position values
        let left;
        let top;
        //left offset based on number of siblings and position within array of siblings
        let siblingOffset = 0;
        let siblingTotalWidth = 0;
        let siblings = this.getSiblings();
        let foundSelfFlag = false;
        for (let i = 0; i < siblings.length; i++) {
            if (foundSelfFlag == false && siblings[i].id != this.id) {
                siblingOffset += siblings[i].getWidth();
                siblingOffset += TreeConfiguration.DEFAULT_NODE_DIST_NEIGHBOR;
            }
            else if (foundSelfFlag == false && siblings[i].id == this.id) {
                foundSelfFlag = true;
                ////console.error("found")
            }
            siblingTotalWidth += siblings[i].getWidth();
            siblingTotalWidth += TreeConfiguration.DEFAULT_NODE_DIST_NEIGHBOR;
        }
        //substract node dist neighbor from last iteration, since no more neighbor
        // if (siblingOffset > 0) {
        //     siblingOffset -= TreeConfiguration.DEFAULT_NODE_DIST_NEIGHBOR;
        // }
        siblingTotalWidth -= TreeConfiguration.DEFAULT_NODE_DIST_NEIGHBOR;
        ////console.log("node: " + this.id + "sib offset: " + siblingOffset + "sib tot off: " + siblingTotalWidth)
        //calculate offset with parent node in the middle as starting point
        left = initLeft + (parentWidth/2) - (siblingTotalWidth / 2)
        left += siblingOffset;
        top = initTop + this.offTop
        //add user offsets (generated by drag drop)
        left += this.offLeft
        this.setPosition(left, top);
    }

    /**
     * Retrieves the transformation applied to node ui element through drag and drop operation
     * @returns 
     */
    getDragDropTransform() {
        let x = this.htmlElem.getAttribute("data-x");
        let y = this.htmlElem.getAttribute("data-y");
        if (x == null) {
            x = 0;
        }
        if (y == null) {
            y = 0;
        }
        x = parseFloat(x);
        y = parseFloat(y);
        return [x,y]
    }

    /**
     * add drag and drop operation to ui element position transformation
     * @param x current x transform
     * @param y current y transform
     */
    addToTransform(x: number, y: number) {
        let transDis = this.getDragDropTransform();
        transDis[0] += x;
        transDis[1] += y;
        this.htmlElem.style.transform = 'translate(' + transDis[0] + 'px, ' + transDis[1] + 'px)';
        this.htmlElem.setAttribute('data-x', transDis[0]);
        this.htmlElem.setAttribute('data-y', transDis[1]);
    }

    /**
     * Sets onclick listeners for node
     */
    setOnclick(): void {
        let self = this;
        //select node
        this.htmlElem.addEventListener('click', (event) => {
            event.stopPropagation();
            event.preventDefault();
            //console.log("focus set on cluster:" + self.name)
            if (self != self.tree.selectedNode) {
                //console.log("not equal selected")
                self.removeSelection(self.getRoot());
                self.tree.changeSelectedNode(self);
                $("#" + this.id).addClass("highlightCluster");
            }

        })
        //adjust node weights
        $("#" + this.id + " .btnAdjWeights").on("click", (event) => {
            event.stopPropagation();
            event.preventDefault();
            //console.log("clicked adj weights");
            this.handleWeightChangeEv();
        });
        //change node name
        $("#" + this.id + " .btnChangeName").on("click", (event) => {
            event.stopPropagation();
            event.preventDefault();
            //console.log("clicked change name");
            self.handleNameChangeEv();
        });
        //change param k
        $("#" + this.id + " .changeK").on("change", () => {
            self.handeParamKChange();
        });
        //open node contextmenu
        $("#" + this.id).on("contextmenu", (event) => {
            event.stopPropagation();
            event.preventDefault();
            let left = getContextMenuPosition(event.clientX, "#nodeContextMenu", 'width', 'scrollLeft')
            let top = getContextMenuPosition(event.clientY, "#nodeContextMenu", 'height', 'scrollTop')
            $("#nodeContextMenu").show()
                .css({
                    position: "absolute",
                    left: left,
                    top: top
                })
                .off('click')
                .on('click', 'a', function (e) {
                    $("#nodeContextMenu").hide();
                    //console.log("context menu clicked: " + $(this).attr("value"));
                    switch ($(this).attr("value")) {
                        case "change_color":
                            self.handleChangeNodeColor();
                            break;
                        case "recluster":
                            self.handleRecluster();
                            break;
                        case "delete_node":
                            self.deleteNodeSelf();
                            break;
                    }
                });
        })
    }

    /**
     * deletes node from tree
     */
    deleteNodeSelf(sendToBackend: boolean = true) {
        //recursively delete child nodes without informing backend
        let toDelete = this.tree.recursiveChildNodes(this);

        //find in parent and delete target node
        let child_index = this.getChildIndex();
        if (child_index === -1) { // only splice array when item is found
            //console.error("Failed removing node this should not happen :/");
            return;
        }
        this.parentNode.childNodes.splice(child_index, 1);
        let child_count_val = this.parentNode.getChildren().length;
        $("#" + this.parentNode.id + " .changeK").val(child_count_val);
        this.parentNode.numClusters = child_count_val;


        //remove node from dom
        this.removeSelfFromDom();
        this.rebalance(this.parentNode);
        this.tree.recursiveConnectionLineUpdate(this.parentNode);
            //remove child from backend
            let msg = JSON.stringify({
                "node_id": this.id,
                "instance_id": BackendCommunicator.getInstance().instance_id,
            });
            BackendCommunicator.getInstance().client.publish("clustering_communicator/backend/remove_node", msg);
        //delete child nodes
        for (let i = 1; i < toDelete.length; i++) {
            toDelete[i].deleteN();
        }
        
    }

    deleteN() {
        //remove node from dom
        this.removeSelfFromDom();
        this.rebalance(this.parentNode);
        //this.tree.recursiveConnectionLineUpdate(this.parentNode);
    }

    /**
     * Gets index of node in array of children of the parent node
     * @returns index
     */
    getChildIndex() {
        let parent = this.getParent();
        for (let i = 0; i < parent.childNodes.length; i++) {
            if (parent.childNodes[i].id == this.id) {
                return i;
            }
        }
        return -1;
    }

    /**
     * handles the recluster operation of node
     */
    handleRecluster() {
        //send request to recluster to backend
        let msg = JSON.stringify({
            "node_id": this.id,
            "instance_id": BackendCommunicator.getInstance().instance_id,
        });
        BackendCommunicator.getInstance().client.publish("clustering_communicator/backend/re_cluster", msg);
    }

    /**
     * Change node color
     */
    handleChangeNodeColor() {
        this.setRandomNodeColor()
    }

    /**
     * Handle the change of node parameter (k for kmeans)
     */
    handeParamKChange() {
        let new_k = Number($("#" + this.id + " .changeK").val())
        if (this.numClusters == 0) {
            //init new cluster centers with correct amount
            while (this.numClusters < new_k) {
                this.addNode(false);
                this.numClusters += 1;
            }
            let msg = JSON.stringify({
                "node_id": this.id,
                "instance_id": BackendCommunicator.getInstance().instance_id,
            });
            BackendCommunicator.getInstance().client.publish("clustering_communicator/backend/re_cluster", msg);
        }
        else if (new_k > this.numClusters) {
            //add clusters to pool of already existing
            while (this.numClusters < new_k) {
                this.addNode();
                this.numClusters += 1;
            }
        }
        else if (new_k < this.numClusters) {
            //remove clusters from total amount of clusters
            //completley removes the latest addes clusters and all subnodes
            while (this.numClusters > new_k) {
                this.removeLastChildNode();
                this.numClusters -= 1;
            }
            let msg = JSON.stringify({
                "node_id": this.id,
                "instance_id": BackendCommunicator.getInstance().instance_id,
            });
            BackendCommunicator.getInstance().client.publish("clustering_communicator/backend/re_cluster", msg);
        }
    }

    /**
     * handles weight adjustments
     */
    handleWeightChangeEv() {
        //only open dialog if attribute weights do exist (backend has processed cluster)
        if (this.attWeights != undefined) {
            //open weight change dialog
            let self = this;
            let weight_template_list: any[] = [];
            let sorted_weight_template_list: any[] = [];
            for (let i = 0; i < this.attributes.length; i++) {
                let isRelevant: boolean = this.attIsInRelevantAtts(this.attributes[i]);
                let temp = [this.attributes[i], this.attWeights[i], Number(isRelevant), i]
                weight_template_list.push(temp);
            }
            //sort in order of importance
            if (this.relImportanceSortOrder.length == this.attWeights.length) {
                for (let i = 0; i < this.relImportanceSortOrder.length; i++) {
                    sorted_weight_template_list.push(weight_template_list[this.relImportanceSortOrder[i]]);
                }
            }
            else {
                sorted_weight_template_list = weight_template_list;
            }
            let helpers = {
                ifEquals: function(arg1, arg2, options) {
                    return (arg1 == arg2) ? options.fn(this) : options.inverse(this);
                }
            };
            let template = require('../templates/interClust/dialogs/adjustWeights.hbs');
            let rendered = template({
                id: "adjust_weight_" + this.id,
                attributes: sorted_weight_template_list,
            }, {helpers: helpers});
            $("body").append(rendered);
            //show and destroy on close
            $('#' + "adjust_weight_" + this.id).modal("show");
            $('#' + "adjust_weight_" + this.id).on('hidden.bs.modal', function (e) {
                document.body.removeChild(document.getElementById("adjust_weight_" + self.id));
            })
            $('#' + "adjust_weight_" + this.id + ' .btnSaveWeights').on('click', function (e) {
                //get weights
                for (let i = 0; i < self.attributes.length; i++){
                    self.attWeights[i] = Number($("#weight_" + String(i)).val())
                }
                //send new weights to backend
                let msg = JSON.stringify({
                    "node_id": self.id,
                    "instance_id": BackendCommunicator.getInstance().instance_id,
                    "att_weights": self.attWeights,
                });
                BackendCommunicator.getInstance().client.publish("clustering_communicator/backend/set_attribute_weights", msg);
                $('#' + "adjust_weight_" + self.id).modal("hide");
            })
        }
    }

    /**
     * Checks if a attribute is in identified set of VERY important attributes of node
     * @param attribute Attribute to check
     * @param clustering_process if rel attributes for future separation of data or node intern relevant attributes should be used for comparison
     * @returns ture if att is relevant
     */
    attIsInRelevantAtts(attribute: string, clustering_process:boolean=true) {
        let rel_atts = this.relAttsClustering;
        if (!clustering_process) {
            rel_atts = this.relAttsIntern
        }
        for (let i = 0; i < rel_atts.length; i++) {
            if (rel_atts[i] == attribute) {
                return true;
            }
        }
        return false;
    }

    /**
     * removes last node in child index
     */
    removeLastChildNode(): void {
        //remove child node from dom
        let to_remove = this.childNodes[this.childNodes.length - 1]
        let n_id = to_remove.id
        to_remove.removeSelfFromDom();
        //remove child from backend
        let msg = JSON.stringify({
            "node_id": n_id,
            "instance_id": BackendCommunicator.getInstance().instance_id,
        });
        BackendCommunicator.getInstance().client.publish("clustering_communicator/backend/remove_node", msg);
        //remove from child list
        this.childNodes = this.childNodes.slice(0, -1);
    }

    /**
     * Handles manual assignment of a new node name
     */
    handleNameChangeEv(): void {
        let self = this;
        let template = require('../templates/interClust/dialogs/changeName.hbs');
        let rendered = template({
            id: "change_name_" + this.id,
            name: this.name.substring(0, 20),
            full_name: this.name,
        });
        $("body").append(rendered);
        //show and destroy on close
        $('#' + "change_name_" + this.id).modal("show");
        $('#'+ "change_name_" + this.id).on('hidden.bs.modal', function (e) {
            document.body.removeChild(document.getElementById("change_name_" + self.id));
        })
        $('#' + "change_name_" + this.id + ' .btnSaveName').on('click', function (e) {
            let newNodeName = String($('#' + "change_name_" + self.id + ' .newNodeName').val());
            self.changeNameConfirmed(newNodeName);
            $('#' + "change_name_" + self.id).modal("hide");
        })
    }

    /** trims cluster names that are to long to visually represent and appends ... to indicate that name goes on */
    getPresentableName(max_length: number = 14): string {
        if (this.name.length < max_length) {
            return this.name;
        }
        return this.name.substring(0, max_length) + "..."
    }

    /**
     * Finalizes the new assignemnt of a node name
     * @param newName new name of node
     */
    changeNameConfirmed(newName: string): void {
        this.name = newName;
        $('#' + this.id + " .nodeNameSpan").html(this.getPresentableName());
        //send name change of node to server
        let msg = JSON.stringify({
            "node_id": this.id,
            "instance_id": BackendCommunicator.getInstance().instance_id,
            "new_name": newName,
        });
        this.updateSelectedVersionIfApply();
        BackendCommunicator.getInstance().client.publish("clustering_communicator/backend/change_name", msg);
    }

    /**
     * Get bottom center bottom of ui element where the hierarchical connection line of the hierarchy should be connected to
     * @param node node of which to get the bottom center should be found
     * @returns position of bottom center of node
     */
    getLineConnectionBottomPoint(node: TreeNode) {
        //let position = $("#" + node.id).position();
        let position = JSON.parse(JSON.stringify(node.getPosition()));
        let transfrom = node.getDragDropTransform();
        //position.top += + transfrom[1] - node.getHeight();
        position.top = node.htmlElem.getBoundingClientRect().top + document.getElementById("hierarchyTreeContainerScroll").scrollTop; //+ transfrom[1];
        position.top -= (this.getParent().nodeHeight - this.getParent().getHeight());
        position.left += (node.getWidth() / 2) + transfrom[0];
        return position;
    }

    /**
     * Get Top center top of ui element where the hierarchical connection line of the hierarchy should be connected to
     * @param node node of which to get the top center should be found
     * @returns position of top center of node
     */
    getLineConnectionTopPoint(node: TreeNode) {
        //let position = $("#" + node.id).position();
        let position = JSON.parse(JSON.stringify(node.getPosition()));
        let transfrom = node.getDragDropTransform();
        ////console.warn("position is: " + position.left + " : " + position.top);
        ////console.warn("height is: " + node.getHeight())
        position.top = node.htmlElem.getBoundingClientRect().top + document.getElementById("hierarchyTreeContainerScroll").scrollTop;
        position.left += (node.getWidth() / 2) + transfrom[0];
        //position.top += transfrom[1];
        let height = node.getHeight()
        position.top -= this.nodeHeight;//-(this.nodeHeight - height);
        ////console.error("transform is:")
        ////console.error(transfrom)
        ////console.warn("position is: " + position.left + " : " + position.top);
        return position;
    }

    // updateConnection() {
    //     ////console.warn("update is called")
    //     let pos1 = this.getLineConnectionBottomPoint(this.getParent());
    //     let pos2 = this.getLineConnectionTopPoint(this);
    //     $("#" + "connection_to_parent_of_" + this.id).attr('x1', pos1.left)
    //     $("#" + "connection_to_parent_of_" + this.id).attr('y1', pos1.top)
    //     $("#" + "connection_to_parent_of_" + this.id).attr('x2', pos2.left)
    //     $("#" + "connection_to_parent_of_" + this.id).attr('y2', pos2.top);
    // }
    updateConnection() {
        let scrollHeight = document.getElementById("clusterHierarchieTree").scrollHeight;
        document.getElementById("clusterHierarchieTree").style.zoom = "1";
        $("#" + "connection_to_parent_of_" + this.id).remove();
        $("#" + "connection_to_parent_of_" + this.id).remove();
        this.drawConnection();
        //this.tree.adjustDragDropScrollWidth();
        ////console.warn("fsgsdfsfdgdsfgasdf: " + scrollHeight)
        document.getElementById("nodeConnectionLineSvg").style["max-height"] = scrollHeight;
        this.setConnectionClickListener();
        if (this.hierRestrictions.length > 0) {
            this.setHierRestPosition();
        }
        document.getElementById("clusterHierarchieTree").style.zoom = String(this.tree.scaleFactor);
    }

    /**
     * Sets onclick listeners for connectionn line between node ui elements
     */
    setConnectionClickListener() {
        let self = this;
        $("#" + "connection_to_parent_of_" + this.id).on("contextmenu", (event) => {
            event.stopPropagation();
            event.preventDefault();
            //console.log($(this).attr("id"))
            let left = getContextMenuPosition(event.clientX, "#connectionContextMenu", 'width', 'scrollLeft')
            let top = getContextMenuPosition(event.clientY, "#connectionContextMenu", 'height', 'scrollTop')
            $("#connectionContextMenu").show()
                .css({
                    position: "absolute",
                    left: left,
                    top: top
                })
                .off('click')
                .on('click', 'a', function (e) {
                    $("#connectionContextMenu").hide();
                    //console.log("context menu clicked: " + $(this).attr("value"));
                    //Todo handle click
                    if ($(this).attr("value") == "adjust_restrictions") {
                        self.handleAdjustHierRestrictions();
                    }
                });
        })
    }

    /**
     * Handles hierarchical restriction menu
     */
    handleAdjustHierRestrictions() {
        //open edit restrictions dialog
        let self = this;
        let template = require('../templates/interClust/dialogs/dqRule.hbs');
        let rendered = template({
            id: "change_hier_restrikt" + this.id,
            name: this.name.substring(0, 20),
            full_name: this.name,
        });
        $("body").append(rendered);
        $('#' + "change_hier_restrikt" + this.id).modal("show");
        $('#'+ "change_hier_restrikt" + this.id).on('hidden.bs.modal', function (e) {
            document.body.removeChild(document.getElementById("change_hier_restrikt" + self.id));
        })
        $('#' + "change_hier_restrikt" + this.id + ' .btnSaveRestrictions').on('click', function (e) {
            //console.warn("im here")
            self.handleSaveRestrictionsConfirmed();
            $('#' + "change_hier_restrikt" + self.id).modal("hide");
        })
        //add already existing ruels to dialog
        for (let i = 0; i < this.hierRestrictions.length; i++) {
            this.addRuleDependency(this.hierRestrictions[i]);
        }
        //set onclick listener to add new restriction
        $('#' + "change_hier_restrikt" + this.id + " .btn_add_restrict").on("click", function (e) {
            //console.warn("button add restrict clicked")
            self.addRuleDependency();
        });
    }

    /**
     * Applies hierarchical restrictions to node
     */
    handleSaveRestrictionsConfirmed() {
        let self = this;
        //parse rules
        //console.warn("saving restrictions")
        let restrictions: any[] = [];
        $(".content-dependency").each(function(){
            let datt = $(this).find(".depAttSelect option:selected").attr("type-id");
            let dcomp = $(this).find(".compSelect option:selected").attr("type-id");
            let dcomp_val = $(this).find(".inputVal").val();
            if (dcomp_val !== "") {
                restrictions.push([datt, dcomp, dcomp_val]);
            }
        });
        this.hierRestrictions = restrictions;
        //send updated restrictions to backend
        let msg = JSON.stringify({
            "node_id": this.id,
            "instance_id": BackendCommunicator.getInstance().instance_id,
            "restrictions": restrictions
        });
        BackendCommunicator.getInstance().client.publish("clustering_communicator/backend/set_node_restrictions", msg);
        //do visualisation in cluster hierarchy
        //first remove vis if already exists
        $("#hierRest_" + this.id).remove();
        //append new element
        let template = require('../templates/interClust/hierRestBox.hbs');
        let rendered = template({
            id: this.id,
            rests: this.hierRestrictions
        });
        $("#clusterHierarchieTree").append(rendered);
        //add on contextmenu listener to new box
        $("#hierRest_" + this.id).on("contextmenu", (event) => {
            event.stopPropagation();
            event.preventDefault();
            //console.log($(this).attr("id"))
            let left = getContextMenuPosition(event.clientX, "#connectionContextMenu", 'width', 'scrollLeft')
            let top = getContextMenuPosition(event.clientY, "#connectionContextMenu", 'height', 'scrollTop')
            $("#connectionContextMenu").show()
                .css({
                    position: "absolute",
                    left: left,
                    top: top
                })
                .off('click')
                .on('click', 'a', function (e) {
                    $("#connectionContextMenu").hide();
                    //console.log("context menu clicked: " + $(this).attr("value"));
                    //Todo handle click
                    if ($(this).attr("value") == "adjust_restrictions") {
                        self.handleAdjustHierRestrictions();
                    }
                });
        })
        //calc and set position of element
        this.updateConnection();
    }

    /**
     * Sets position of ui element
     */
    setHierRestPosition() {
        let bot_pt = this.getLineConnectionBottomPoint(this.getParent());
        let top_pt = this.getLineConnectionTopPoint(this);
        let center_left = top_pt.left - ((top_pt.left - bot_pt.left) / 2);
        let center_top = top_pt.top + ((bot_pt.top - top_pt.top) / 2);
        //offset by element dimensions
        let width = document.getElementById("hierRest_" + this.id).getBoundingClientRect().width;
        let height = document.getElementById("hierRest_" + this.id).getBoundingClientRect().height;
        center_left -= width / 2;
        center_top -= height / 2;
        $("#hierRest_" + this.id).css("left", center_left);
        $("#hierRest_" + this.id).css("top", center_top);
    }

    /**
     * Gets hierarchy level of node
     * @returns hierarchy level
     */
    getHierarchyLevel() {
        let lvl = 0;
        let node: TreeNode = this;
        while (!node.isRoot()) {
            node = node.getParent();
            lvl += 1;
        }
        return lvl;
    }

    /**
     * Edit dependency rules
     * @param dependencyInfo 
     */
    addRuleDependency(dependencyInfo?: Array<any>){
        let dialog = this;
        let template = require('../templates/interClust/dialogs/dqRuleDependency.hbs');
        let rendered = template({
            attributes: dialog.attributes,
        });
        $("#hierRestrictionDiv").append(rendered);
        //set event listener to delete dependency again
        $("#hierRestrictionDiv .dependency:last .delete_dependency_button").on("click", function(){
            if($("#hierRestrictionDiv .dependency").length > 0){
                $( this ).parent().remove();
            }
        });
        if(dependencyInfo){
            $("#hierRestrictionDiv .dependency:last .depAttSelect option[type-id='" + dependencyInfo[0] + "']").prop("selected", true);
            $("#hierRestrictionDiv .dependency:last .compSelect option[type-id='" + dependencyInfo[1] + "']").prop("selected", true);
            $("#hierRestrictionDiv .dependency:last input").val(dependencyInfo[2]);
        }
    }

    /**
     * Draw hierarchical connection lines
     */
    drawConnection() {
        if (this.isRoot()) {
            return null;
        }
        let pos1 = this.getLineConnectionBottomPoint(this.getParent());
        let pos2 = this.getLineConnectionTopPoint(this);
        let x1 = pos1.left;
        let y1 = pos1.top;
        let x2 = pos2.left;
        let y2 = pos2.top;
        let width = this.htmlElem.parentNode.parentNode.scrollWidth;
        let height = this.htmlElem.parentNode.parentNode.scrollHeight;
        $("#nodeConnectionLineSvg").attr("width", width + "px");
        $("#nodeConnectionLineSvg").attr("height", height + "px");
        let template = require('../templates/interClust/connectLine.hbs');
        let rendered = template({
            id: "connection_to_parent_of_" + this.id,
            x1: x1,
            y1: y1,
            x2: x2,
            y2: y2,
        });
        ////console.warn(rendered)
        ////console.error(document.getElementById("nodeConnectionLineSvg"))
        //$("#nodeConnectionLineSvg").append(rendered);
        document.getElementById("nodeConnectionLineSvg").insertAdjacentHTML('beforeend', rendered);
    }

}
