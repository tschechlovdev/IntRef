import copy
import itertools
import json
import random
import textwrap
from typing import Dict, List, Tuple
from urllib.error import ContentTooShortError
from data_container import DataContainer
from.clusterCalculation import PCKMeans
import numpy as np
from pandas import DataFrame
from FeatureFinder.methods import *
from sklearn import metrics
from .active_learning import ExploreConsolidate
import time
import pandas as pd


class TreeNode:
    """Used to instantiate nodes in the cluster hierarchy.
    Manages the application of operations the calculation of partial results and stores node information"""

    def __init__(self, tree, id, parent=None, version="", name=""):
        self.id: str = id
        self.children: List[TreeNode] = []
        #parent node needs to exist for all but root element
        self.parent: TreeNode = parent
        self.tree = tree
        self.version: str = version
        self.name: str = name

        self.data:DataContainer = None
        #calculation related
        self.clusterObj: PCKMeans = None
        self.att_weights: List[float] = None
        self.q_indikators = []
        #list of value restrictions placed on values in node
        #has format [["attribute", ">|<|="], ...]
        self.hier_restrictions = []
        #rows manually assigned to cluster via table view
        self.assigned_rows = {}
        #active query object for cluster
        self.active_learn_obj = ExploreConsolidate(self, 0)
        #must link and cannot link constraints
        self.ml_const: Dict[Tuple[int, int]: bool] = {}
        self.cl_const: Dict[Tuple[int, int]: bool] = {}
        #following 3 vars ONLY used for evaluation section of paper
        self.consts_quantile_05 = [['t_enth', 'computer', '>', 0.5834029951631305], ['t_enth', 'mobiltelefone', '>', 0.6295178649152985], ['f_enth', 'games', '>', 0.5686051368240777], ['f_enth', 'filme_musik', '>', 0.6085571702205556], ['a_enth', 'smart_home', '>', 0.5615370687681729], ['a_enth', 'haushaltsgeraete', '>', 0.6044028518718608], ['fo_enth', 'foto', '>', 0.6514313177481835], ['fo_enth', 'sports_freizeit', '>', 0.5254570277970521], ['sp_enth', 'foto', '>', 0.5398798993898182], ['sp_enth', 'sports_freizeit', '>', 0.601293559460641], ['o_enth', 'foto', '>', 0.5486481451234353], ['o_enth', 'sports_freizeit', '>', 0.5536582364203545]]
        self.consts_quantile_01 = [['t_enth', 'computer', '>', 0.5102119738687372], ['t_enth', 'mobiltelefone', '>', 0.5858057771909856], ['f_enth', 'games', '>', 0.4944430730083437], ['f_enth', 'filme_musik', '>', 0.5479722396395527], ['a_enth', 'smart_home', '>', 0.49818241467475544], ['a_enth', 'haushaltsgeraete', '>', 0.5526582868704523], ['fo_enth', 'foto', '>', 0.5471931572796063], ['fo_enth', 'sports_freizeit', '>', 0.5037217635391997], ['sp_enth', 'foto', '>', 0.5047057411870113], ['sp_enth', 'sports_freizeit', '>', 0.5712729671446625], ['o_enth', 'foto', '>', 0.509545996685354], ['o_enth', 'sports_freizeit', '>', 0.5197415911674129]]
        self.consts_minimum = [['t_enth', 'computer', '>', 0.4834031062306183], ['t_enth', 'mobiltelefone', '>', 0.566614620059954], ['f_enth', 'games', '>', 0.4584267973722954], ['f_enth', 'filme_musik', '>', 0.4307200703064404], ['a_enth', 'smart_home', '>', 0.4548274950838131], ['a_enth', 'haushaltsgeraete', '>', 0.4845950555410334], ['fo_enth', 'foto', '>', 0.5146454190792742], ['fo_enth', 'sports_freizeit', '>', 0.4328154531230848], ['sp_enth', 'foto', '>', 0.4601200128668699], ['sp_enth', 'sports_freizeit', '>', 0.5367452306656656], ['o_enth', 'foto', '>', 0.4601200128668699], ['o_enth', 'sports_freizeit', '>', 0.4328154531230848]]
        #constraints applied to node
        self.applied_constraints = []
        self.accuracy_values = []

    def addChild(self, id, name):
        """add child node to node instance"""
        n_node = TreeNode(self.tree, id, parent=self, name=name)
        self.children.append(n_node)
        print("added new node nodename: " + n_node.name)

    def get_children(self) -> List['TreeNode']:
        """get children of node"""
        return self.children
    
    def get_num_clust(self):
        """get number of clusters this node is split into"""
        return len(self.get_children())

    def set_attribute_weights(self, n_weights):
        """set weights for attributes when clustering node content to lower hirarchie level"""
        self.att_weights = n_weights
        self.calculate_cluster()

    def isRoot(self):
        """check if node is root node of true

        Returns:
            boolean: true if node is root otherwise false
        """
        return (self.parent is None)

    def get_parent(self) -> 'TreeNode':
        """get parent of current node"""
        return self.parent

    def set_version(self, version):
        """get version id of current node"""
        self.version = version

    def get_data_table_data(self):
        """Get content of node for the purpose of creating a table representation later on

        Returns:
            str: data instances of node as json
        """
        if len(self.get_children()) == 0:
            return self.data.get_data_table_data("-")
        data = []
        for child in self.get_children():
            data += json.loads(child.data.get_data_table_data(child.id))
        return json.dumps(data)    

    def calculate_cluster(self):
        """Calculate a clustering result for the current node"""
        #init timing vars
        end = 0
        start = 0
        if len(self.get_children()) > 0 and self.data != None:
            #get weights
            weights = self.att_weights
            hier_rest = self.get_child_node_hier_restrictions()
            if weights == None:
                weights = [1] * len(self.data.get_attributes_of_dataset_no_class())
            if self.clusterObj == None or len(self.get_children()) != self.clusterObj.n_clusters:
                if self.clusterObj == None:
                    self.clusterObj = PCKMeans(self.get_num_clust())
                self.clusterObj.att_weights = np.array(weights)
                self.clusterObj.hier_rest = hier_rest
                #case more children (more clusters) than previous calculation --> not complete recalc but use previous centers and add new ones
                if len(self.get_children()) > self.clusterObj.n_clusters:
                    self.clusterObj.n_clusters = len(self.get_children())
                    self.clusterObj.init_centers(self.data.get_data_as_nparray_no_class(), recalc=False)
                #otherwise find completly new clusters
                else:
                    self.clusterObj.n_clusters = len(self.get_children())
                    self.clusterObj.init_centers(self.data.get_data_as_nparray_no_class())
            #get manually assigned rows
            rel_assigned_rows = self.get_manually_assigned_nodes_calc()
            self.clusterObj.manually_assigned = rel_assigned_rows
            #get feature weights
            self.clusterObj.att_weights = np.array(weights)
            #get hierarchical restrictions
            self.clusterObj.hier_rest = hier_rest
            #get constraints
            ml, cl = self.get_applicable_constraints()
            start = time.time()
            self.clusterObj.fit(self.data.get_data_as_nparray_no_class(), y=None, ml=ml, cl=cl)
            end = time.time()
            #self.evaluate_result(self.clusterObj.labels_)
            local_data = self.data.get_unique_id_data()
            local_unencoded_data = self.data.get_unencoded_unique_id_data()
            for child_index, child in enumerate(self.get_children()):
                child.data = DataContainer.from_data_container(self.data)
                child_data_content = []
                unencoded_child_data_content = []
                #assign data tuples that got clustered into child into child data contaienr
                for tuple_index, label in enumerate(self.clusterObj.labels_):
                    if child_index == label:
                        child_data_content.append(local_data[tuple_index])
                        unencoded_child_data_content.append(local_unencoded_data[tuple_index])
                child.data.df_with_unique_rowid = DataFrame(child_data_content, columns=self.data.get_attributes_of_dataset_with_unique())
                child.data.unencoded_df_unique_row_id = DataFrame(unencoded_child_data_content, columns=self.data.get_attributes_of_dataset_with_unique())
                child.data.set_df_from_unique_df()
                child.data.set_data_from_df()
                child.data.set_unencoded_df_from_unencoded_unique()
                #child.data.df = DataFrame(child_data_content, columns=self.data.get_attributes_of_dataset())
            for child in self.get_children():
                child.calculate_cluster()
        self.analyze_result()
        return end-start

    def evaluate_result(self, labels):
        """Evaluates the result for eval section of paper"""
        #evaluation for result using predefined labels from data generation
        temp_df = copy.deepcopy(self.data.unencoded_df_unique_row_id)
        temp_df["predict"] = labels
        mappings = list(itertools.permutations(['t_enth', 'f_enth', 'a_enth', 'o_enth'], 4))
        best_acc = 0
        best_mapping = []
        #calc accuracy for each mapping and select best one
        for mapping in mappings:
            count = 0
            corr = 0
            for index, row in temp_df.iterrows():
                count += 1
                x = row["class"] 
                # if int(row["predict"]) >= len(mapping):
                #     print("yes")
                y = mapping[int(row["predict"])]
                if row["class"] == mapping[int(row["predict"])] or (row["class"] in ["fo_enth", "sp_enth"] and mapping[int(row["predict"])]=="o_enth"):
                    corr += 1
            acc = corr/count
            if acc > best_acc:
                best_acc = acc
                best_mapping = mapping
        print("BEST ACC")
        print(best_acc)
        print(best_mapping)
        #self.identify_best_value_constraint(best_mapping, temp_df)
        return best_acc, best_mapping

    def evaluate_result_flat(self, labels):
        """Alernative eval function for eval section of paper"""
        #evaluation for result using predefined labels from data generation
        temp_df = copy.deepcopy(self.data.unencoded_df_unique_row_id)
        temp_df["predict"] = labels
        mappings = list(itertools.permutations(['t_enth', 'f_enth', 'a_enth', 'fo_enth', 'sp_enth'], 5))
        best_acc = 0
        best_mapping = []
        #calc accuracy for each mapping and select best one
        for mapping in mappings:
            count = 0
            corr = 0
            for index, row in temp_df.iterrows():
                count += 1
                x = row["class"] 
                y = mapping[int(row["predict"])]
                if row["class"] == mapping[int(row["predict"])]: #or (row["class"]=="o_enth" and mapping[int(row["predict"])] in ["fo_enth", "sp_enth"]):
                    corr += 1
            acc = corr/count
            if acc > best_acc:
                best_acc = acc
                best_mapping = mapping
        print("BEST ACC")
        print(best_acc)
        print(best_mapping)
        #self.identify_best_value_constraint(best_mapping, temp_df)
        return best_acc, best_mapping

    def evaluate_hier_result_non_flat(self):
        """Alernative alternative eval function for eval section of paper"""
        #evaluation for result using predefined labels from data generation
        #first get final result of all leaf nodes
        df_list = []
        for i_index, leaf_node in enumerate([node for node in self.tree.flatten() if node.is_leaf_node()]):
            df_list.append(leaf_node.data.get_df_clabel(i_index))
        res_data = pd.concat(df_list)
        temp_df = copy.deepcopy(res_data)
        mappings = list(itertools.permutations(['t_enth', 'f_enth', 'a_enth', 'fo_enth', 'sp_enth'], 5))
        best_acc = 0
        best_mapping = []
        #calc accuracy for each mapping and select best one
        for mapping in mappings:
            count = 0
            corr = 0
            for index, row in temp_df.iterrows():
                count += 1
                x = row["class"] 
                # if int(row["predict"]) >= len(mapping):
                #     print("yes")
                y = mapping[int(row["C_Label"])]
                if row["class"] == mapping[int(row["C_Label"])]:
                    corr += 1
            acc = corr/count
            if acc > best_acc:
                best_acc = acc
                best_mapping = mapping
        print("BEST ACC")
        print(best_acc)
        print(best_mapping)
        #self.identify_best_value_constraint(best_mapping, temp_df)
        return best_acc, best_mapping

    def evaluate_hier_result_second_level(self, labels):
        """eval function (hierarchical) for eval section of paper"""
        #evaluation for result using predefined labels from data generation
        temp_df = copy.deepcopy(self.data.unencoded_df_unique_row_id)
        temp_df["predict"] = labels
        mappings = list(itertools.permutations(['fo_enth', 'sp_enth'], 2))
        best_acc = 0
        best_mapping = []
        #calc accuracy for each mapping and select best one
        for mapping in mappings:
            count = 0
            corr = 0
            for index, row in temp_df.iterrows():
                count += 1
                x = row["class"] 
                # if int(row["predict"]) >= len(mapping):
                #     print("yes")
                if int(row["predict"])<2 and row["class"] == mapping[int(row["predict"])]:
                    corr += 1
            acc = corr/count
            if acc > best_acc:
                best_acc = acc
                best_mapping = mapping
        print("BEST ACC")
        print(best_acc)
        print(best_mapping)
        #self.identify_best_value_constraint(best_mapping, temp_df)
        return best_acc, best_mapping

    def identify_best_value_constraint(self, best_mapping: List[str], df_with_predicitons, constraints, objective="best", local_applied_constraints=[]):
        """identifies value constraints with most violating instances for evaluation section

        Args:
            best_mapping (List[str]): best mapping of generated labels to ground truth
            df_with_predicitons (_type_): df with predicted labels and ground truth
        """
        #default constraint set for 4 cluster labels
        possible_constraints = constraints
        if objective=="worst":
            possible_constraints = [i for i in possible_constraints if i not in local_applied_constraints]
        # [
        #     ['t_enth', 'computer', '>', '0.7'],  ['t_enth', 'mobiltelefone', '>', '0.7'],  ['f_enth', 'games', '>', '0.7'], ['f_enth', 'filme_musik', '>', '0.7'], 
        #     ['a_enth', 'smart_home', '>', '0.7'], ['a_enth', 'haushaltsgeraete', '>', '0.7'], ['o_enth', 'foto', '>', '0.7'], ['o_enth', 'sports_freizeit', '>', '0.7']
        # ]
        #get constraint violations
        violations = []
        for const in possible_constraints:
            const_violations = 0
            for index, row in df_with_predicitons.iterrows():
                if best_mapping[int(row["predict"])] == const[0]:
                    const_violations += int(not eval(f"{row[const[1]]}{const[2]}{const[3]}"))
            violations.append(const_violations)
        best_constraint_index = np.argmax(violations)
        if objective=="worst":
            best_constraint_index = np.argmin(violations)
        print(f"Best value constraint to apply next is: {possible_constraints[best_constraint_index]}")
        print("Complete Constraint output is:")
        print(list(zip(possible_constraints, violations)))
        return possible_constraints[best_constraint_index]

    def identify_hier_best_value_constraint(self, best_mapping: List[str], df_with_predicitons, constraints):
        """identifies value constraints with most violating instances for evaluation section

        Args:
            best_mapping (List[str]): best mapping of generated labels to ground truth
            df_with_predicitons (_type_): df with predicted labels and ground truth
        """
        #default constraint set for 4 cluster labels
        possible_constraints = [const for const in constraints if not (const in self.applied_constraints)]
        if len(possible_constraints) == 0:
            return None, -9999999
        # [
        #     ['t_enth', 'computer', '>', '0.7'],  ['t_enth', 'mobiltelefone', '>', '0.7'],  ['f_enth', 'games', '>', '0.7'], ['f_enth', 'filme_musik', '>', '0.7'], 
        #     ['a_enth', 'smart_home', '>', '0.7'], ['a_enth', 'haushaltsgeraete', '>', '0.7'], ['o_enth', 'foto', '>', '0.7'], ['o_enth', 'sports_freizeit', '>', '0.7']
        # ]
        #get constraint violations
        violations = []
        for const in possible_constraints:
            const_violations = 0
            for index, row in df_with_predicitons.iterrows():
                if best_mapping[int(row["predict"])] == const[0]:#  or (best_mapping[int(row["predict"])]=="o_enth" and const[0] in ['sp_enth', 'fo_enth']):
                    const_violations += int(not eval(f"{row[const[1]]}{const[2]}{const[3]}"))
            violations.append(const_violations)
        best_constraint_index = np.argmax(violations)
        print(f"Best value constraint to apply next is: {possible_constraints[best_constraint_index]}")
        print("Complete Constraint output is:")
        print(list(zip(possible_constraints, violations)))
        return possible_constraints[best_constraint_index], violations[best_constraint_index]

    def identify_hier_best_value_constraints_level_two(self, best_mapping: List[str], df_with_predicitons, constraints):
        """identifies value constraints with most violating instances for evaluation section

        Args:
            best_mapping (List[str]): best mapping of generated labels to ground truth
            df_with_predicitons (_type_): df with predicted labels and ground truth
        """
        #default constraint set for 4 cluster labels
        possible_constraints = [const for const in constraints if (const[0] in ['sp_enth', 'fo_enth']) and not (const in self.applied_constraints)]
        if len(possible_constraints) == 0:
            return None, -9999999
        # [
        #     ['t_enth', 'computer', '>', '0.7'],  ['t_enth', 'mobiltelefone', '>', '0.7'],  ['f_enth', 'games', '>', '0.7'], ['f_enth', 'filme_musik', '>', '0.7'], 
        #     ['a_enth', 'smart_home', '>', '0.7'], ['a_enth', 'haushaltsgeraete', '>', '0.7'], ['o_enth', 'foto', '>', '0.7'], ['o_enth', 'sports_freizeit', '>', '0.7']
        # ]
        #get constraint violations
        violations = []
        for const in possible_constraints:
            const_violations = 0
            for index, row in df_with_predicitons.iterrows():
                if best_mapping[int(row["predict"])] == const[0]:#  or (best_mapping[int(row["predict"])]=="o_enth" and const[0] in ['sp_enth', 'fo_enth']):
                    const_violations += int(not eval(f"{row[const[1]]}{const[2]}{const[3]}"))
            violations.append(const_violations)
        best_constraint_index = np.argmax(violations)
        print(f"Best value constraint to apply next is: {possible_constraints[best_constraint_index]}")
        print("Complete Constraint output is:")
        print(list(zip(possible_constraints, violations)))
        return possible_constraints[best_constraint_index], violations[best_constraint_index]

    def re_cluster(self):
        """apply re cluster operation on node"""
        if self.clusterObj == None:
            self.calculate_cluster()
        elif len(self.get_children()) > 0:
            #set cluster amount of cluster object and reset cluster centers
            self.clusterObj.n_clusters = len(self.get_children())
            self.clusterObj.init_centers(self.data.get_data_as_nparray_no_class())
            self.calculate_cluster()

    def get_index_of_child(self, node_id: str) -> int:
        """get list index of a child node by node id"""
        for i, node in enumerate(self.get_children()):
            if node.id == node_id:
                return i
        return -1

    def set_hier_restrictions(self, hier_rest):
        """set hierarchy restriction on node"""
        #convert attribute string names to attribute index
        h_rest = []
        for rest in hier_rest:
            ind = self.get_attribute_index(rest[0])
            if ind != -1:
                #check if rest is string if so encode
                if not str(rest[2]).replace('.','',1).isdigit():
                    #encode
                    try:
                        rest[2] = self.data.d[rest[0]].transform([rest[2]])[0]
                    except:
                        continue
                rest[0] = ind
                h_rest.append(rest)
        self.hier_restrictions = h_rest
        self.get_parent().calculate_cluster()

    def append_hier_restriction(self, rest, child_index):
        """set hierarchy restriction on node"""
        ind = self.get_attribute_index(rest[0])
        if ind != -1:
            #check if rest is string if so encode
            if not str(rest[2]).replace('.','',1).isdigit():
                #encode
                try:
                    rest[2] = self.data.d[rest[0]].transform([rest[2]])[0]
                except:
                    pass
            rest[0] = ind
            self.children[child_index].hier_restrictions.append(rest)

    def get_manually_assigned_nodes_calc(self):
        rel_assigned_rows = []
        for child in self.get_children():
            temp_res = []
            temp_assigned = list(child.assigned_rows.keys())
            #map row ids to indexes in current dataset if applicable
            for r_id in temp_assigned:
                mapped_id = self.data.get_unique_row_id_index(int(r_id))
                if mapped_id != -1:
                    temp_res.append(mapped_id)
            rel_assigned_rows.append(temp_res)
        return rel_assigned_rows

    def get_attribute_index(self, attribute_name):
        """get index of attribute in attribute list"""
        for index, att in enumerate(self.data.get_attributes_of_dataset_no_class()):
            if att == attribute_name:
                return index
        return -1

    def get_child_node_hier_restrictions(self):
        """get hier restriction of all child nodes"""
        rest = []
        for child in self.get_children():
            rest.append(child.hier_restrictions)
        return rest

    def get_siblings(self):
        """get siblings of node"""
        if self.isRoot():
            return []
        else:
            return self.get_parent().get_children()

    def get_active_query(self):
        """get new active query for node content"""
        query = self.active_learn_obj.fit_step()
        return query

    def is_leaf_node(self):
        """check if current node is leaf node"""
        return len(self.get_children())==0

    def answer_act_query(self, q_answ: bool):
        """process an answer to a previous active query"""
        self.active_learn_obj.query_answer(q_answ)
        ml, cl = self.active_learn_obj.get_pairwise_const()
        for const in ml:
            self.ml_const[const] = True
        for const in cl:
            self.cl_const[const] = True
        self.calculate_cluster()

    def get_applicable_constraints(self) -> List[Tuple[int, int]]:
        """get applicable constraints"""
        ml = list(self.ml_const.keys())
        cl = list(self.cl_const.keys())
        ml_app = []
        cl_app = []
        for const in ml:
            #check if both parts of constraints are present in current data container
            if self.data.get_unique_row_id_index(const[0]) != -1 and self.data.get_unique_row_id_index(const[1]) != -1:
                ml_app.append(const)
        for const in cl:
            #check if both parts of constraints are present in current data container
            if self.data.get_unique_row_id_index(const[0]) != -1 and self.data.get_unique_row_id_index(const[1]) != -1:
                cl_app.append(const)
        return ml, cl


    def remove_child(self, node_id: str):
        """removes child node by node id"""
        child_index = self.get_index_of_child(node_id)
        if child_index != -1:
            del self.children[child_index]
        self.calculate_cluster()

    def assign_row_to_cluster(self, row_id):
        """update manual row assignment"""
        #delete manual assignment of node from all siblings
        to_remove = self.get_siblings()
        for node in to_remove:
            if row_id in node.assigned_rows:
                del node.assigned_rows[row_id]
        #assign row to self
        self.assigned_rows[row_id] = True


    def analyze_result(self):
        """analyze clustering result to provide summary information about distribution and quality indices to frontend"""
        if self.data == None:
            return
        #analyze clustering result to generate node level description for hierarchy visualisation
        #number of tuples in cluster
        num_instances = self.data.get_length()
        relative_num_instances = "-"
        if not self.isRoot():
            relative_num_instances = num_instances/self.get_parent().data.get_length()
        #important features
        important_features_within_clust = []
        quality_indicator = "-"
        if not self.isRoot():
            clusters = self.get_parent().get_clusters_feature_finder_format()
            important_features_within_clust = relevant_feature_per_cluster(clusters, self.data.get_header_no_class())
            important_features_within_clust = important_features_within_clust[self.get_child_index()]
        important_features_between_cluster = []
        sorted_feature_importance_indice = "-"
        if len(self.get_children()) != 0:
            clusters = self.get_clusters_feature_finder_format()
            important_features_between_cluster, thresholds, sorted_feature_importance_indice = get_overall_relevant_features(clusters, self.data.get_header_no_class())
            if len(important_features_between_cluster) > 0:
                important_features_between_cluster = important_features_between_cluster[0]
            #also calculate quality indicators
            quality_indicator = self.calc_quality_indicators()
        #get feature thresholds
        important_within_thresholds = []
        for att in important_features_within_clust:
            #check if is numeric
            if att not in self.data.string_columns:
                #get range
                min_val = self.data.df[att].min()
                max_val = self.data.df[att].max()
                important_within_thresholds.append([min_val, max_val])
            else:
                important_within_thresholds.append(["-", "-"])

        important_within_thresholds = []
        important_between_thresholds = []
        for att in important_features_within_clust:
            #check if is numeric
            if att not in self.data.string_columns:
                #get range
                min_val = str(round(self.data.df[att].min(), 2))
                max_val = str(round(self.data.df[att].max(), 2))
                important_within_thresholds.append([min_val, max_val])
            else:
                important_within_thresholds.append(["-", "-"])
        for att in important_features_between_cluster:
            #check if is numeric
            if att not in self.data.string_columns:
                #get range
                min_val = str(round(self.data.df[att].min(), 2))
                max_val = str(round(self.data.df[att].max(), 2))
                important_between_thresholds.append([min_val, max_val])
            else:
                important_between_thresholds.append(["-", "-"])
        
        data = {"instance_id": self.tree.instance_id,
        "node_id": self.id,
        "num_instances": num_instances,
        "relative_num_instances": relative_num_instances,
        "important_features_within_clust": important_features_within_clust,
        "important_within_thresholds": important_within_thresholds,
        "important_features_between_cluster": important_features_between_cluster,
        "important_between_thresholds": important_between_thresholds,
        "quality_indicator": quality_indicator,
        "attributes": self.data.get_attributes_of_dataset_no_class(),
        "sorted_feature_importance_indice": sorted_feature_importance_indice,
        "stat_summary": self.data.get_data_summary(),
        "quality_indicator_list": self.q_indikators,
        }
        self.tree.client.publish("clustering_communicator/frontend/nodeInfoUpdateFrontend",
                json.dumps(data), qos=2)

    def calc_quality_indicators(self):
        """calc data quality indicators"""
        q_indi = "-"
        self.q_indikators = []
        try:
            #-1, 1
            sil = metrics.silhouette_score(self.data.get_data_as_nparray_no_class(), self.clusterObj.labels_, metric='euclidean')
            self.q_indikators.append(["Silhouettenkoeffizient", sil, "Der Wert des Indikators bewegt sich im Bereich [-1, 1] je höher der Wert desto besser"])
            cal_harab = metrics.calinski_harabasz_score(self.data.get_data_as_nparray_no_class(), self.clusterObj.labels_)
            self.q_indikators.append(["Calinski-Harabasz", cal_harab, "Der Wert des Indikators bewegt sich im Bereich [0, inf] je höher der Wert desto besser"])
            davies = metrics.davies_bouldin_score(self.data.get_data_as_nparray_no_class(), self.clusterObj.labels_)
            self.q_indikators.append(["Davies-Bouldin", davies, "Je höher der Wert desto besser"])
            q_indi = sil
        except:
            pass
        return q_indi

    def get_clusters_feature_finder_format(self):
        """get clusters in the format used by the feature finder module which is used to identify important features"""
        clu = []
        for child in self.get_children():
            clu.append(child.data.get_data_as_nparray_no_class())
        return np.array(clu)

    def get_clusters_coords_format(self):
        """get clustering information in the format used by the parallel coords plot"""
        clu = []
        if len(self.get_children()) > 0:
            for child in self.get_children():
                data = child.data.get_data_clabel(child.name)
                if len(data) > 0:
                    clu.append(child.data.get_data_clabel(child.name))
        else:
            clu.append(self.data.get_data_clabel(self.name))
        return np.concatenate(clu)

    def get_child_index(self):
        """returns index current node has in child list of parent node
        """
        if not self.isRoot():
            for index, node in enumerate(self.get_parent().get_children()):
                if self.id == node.id:
                    return index
        return -1

    def setName(self, n_name: str):
        #check if evaluation should be performed (ONLY for paper)
        if "eval" in n_name:
            #if known constraints should be applied in random order
            if n_name == "eval_r":
                self.generate_evaluation(self.consts_minimum, "Minimum", mode="random")
                #self.generate_evaluation(self.consts_quantile_01, "Quantile 05", mode="random")
                self.generate_evaluation(self.consts_quantile_05, "Quantile 01", mode="random")
                self.generate_evaluation(self.consts_minimum, "Minimum", mode="optimal")
                self.generate_evaluation(self.consts_quantile_05, "Quantile 01", mode="optimal")

            elif n_name == "init_eval":
                self.evaluate_result(self.clusterObj.labels_)

            elif n_name == "eval_h_flat":
                #eval hierarchical scenario with flat clustering and constraints
                self.generate_hier_evaluation(self.consts_minimum, "Minimum", mode="optimal")

            elif n_name == "eval_h_hier":
                #eval hierarchical scenario with hierarchie and constraints
                self.generate_hier_evaluation_1(self.consts_minimum, "Minimum", mode="optimal")

            #if known constraints should be applied in optimal order
            elif n_name == "eval_o":
                self.generate_evaluation(self.consts_minimum, "Minimum", mode="optimal")
                #self.generate_evaluation(self.consts_quantile_01, "Quantile 05", mode="optimal")
                self.generate_evaluation(self.consts_quantile_05, "Quantile 05", mode="optimal")
                self.generate_evaluation(self.consts_minimum, "Minimum Worst Order", mode="optimal", objective="worst")
                self.generate_evaluation(self.consts_minimum, "Minimum", mode="random", repetitions=10)
                self.generate_evaluation(self.consts_quantile_05, "Quantile 05", mode="random", repetitions=10)

            
        self.name = n_name
        print("setName to: " + n_name)

    def generate_evaluation(self, constraints, const_name, mode="random", repetitions=5, objective="best"):
        """ONLY USED for evaluation on test data set triggered by rename starting with eval

        Args:
            mode (str, optional): random|optimal --> constraint selection strategy.
            repetitions (int, optional): number of repetitions that are made end result is avg of all repetitions
        """
        #         possible_constraints = []
        # applied_constraints = []
        # accuracy_values = []
        ov_acc = []
        ov_const = []
        ov_timings = []
        for i in range(repetitions):
            print("at evalutation repetition: " + str(i))
            accuracy = []
            timing = []
            self.clusterObj == None
            timing.append(self.calculate_cluster())
            acc, mapping = self.evaluate_result(self.clusterObj.labels_)
            local_applied_constraints = []
            while len(self.applied_constraints) < len(constraints):
                print(f"Eval progress: {len(self.applied_constraints)}/{len(constraints)}")
                #calc current accuracy
                acc, t_val = self.evaluate_result(self.clusterObj.labels_)
                accuracy.append(acc)
                #select next constraint
                selected_const = None
                if mode=="random":
                    i = random.randrange(0, len(constraints))
                    while constraints[i] in self.applied_constraints:
                        i = random.randrange(0, len(constraints))
                    selected_const = constraints[i]
                    self.applied_constraints.append(selected_const)
                elif mode=="optimal":
                    #start by identifying best possible constraint to apply next
                    temp_df = copy.deepcopy(self.data.unencoded_df_unique_row_id)
                    temp_df["predict"] = self.clusterObj.labels_
                    selected_const = self.identify_best_value_constraint(mapping, temp_df, constraints, objective=objective, local_applied_constraints=local_applied_constraints)
                    self.applied_constraints.append(selected_const)
                #automatically apply selected constraints
                self.append_hier_restriction(selected_const[1:], mapping.index(selected_const[0]))
                local_applied_constraints.append(selected_const)
                #recalc
                t_time = self.calculate_cluster()
                timing.append(t_time)
            acc, mapping = self.evaluate_result(self.clusterObj.labels_)
            accuracy.append(acc)
            #save values of iteration
            ov_const.append(self.applied_constraints)
            ov_acc.append(accuracy)
            ov_timings.append(timing)
            #reset for next iteration
            self.applied_constraints = []
            self.clusterObj = None
            for child in self.children:
                child.hier_restrictions = []
                self.clusterObj = None
        #reset for next iteration
        self.applied_constraints = []
        self.clusterObj = None
        for child in self.children:
            child.hier_restrictions = []
            self.clusterObj = None
        #save result
        aggregated_score = list(map(lambda x: np.average(x), zip(*ov_acc)))
        aggregated_timings = list(map(lambda x: np.average(x), zip(*ov_timings)))
        with open("eval_res.txt", "a") as f:
            f.write(textwrap.dedent(
            f"""
            ------------------------------------------------------------------------------------------------
            ----------------------------------------------
            Constraint Set Name: {const_name}
            Mode: {mode}
            Repetitions: {repetitions}
            ----------------------------------------------
            Accuracy scores: {ov_acc}
            Average Accuracy: {aggregated_score}
            -----------
            Average Timings: {aggregated_timings}
            All Timings: {ov_timings}
            -----------
            Selection order: {ov_const}
            ------------------------------------------------------------------------------------------------
            """
            ))

    def generate_hier_evaluation(self, constraints, const_name, mode="random", repetitions=5):
        """ONLY USED for evaluation on test data set triggered by rename starting with eval

        Args:
            mode (str, optional): random|optimal --> constraint selection strategy.
            repetitions (int, optional): number of repetitions that are made end result is avg of all repetitions
        """
        #         possible_constraints = []
        # applied_constraints = []
        # accuracy_values = []
        ov_acc = []
        ov_const = []
        ov_timings = []
        for i in range(repetitions):
            print("at evalutation repetition: " + str(i))
            accuracy = []
            timing = []
            timing.append(self.calculate_cluster())
            acc, mapping = self.evaluate_result_flat(self.clusterObj.labels_)
            while len(self.applied_constraints) < len(constraints):
                print(f"Eval progress: {len(self.applied_constraints)}/{len(constraints)}")
                #calc current accuracy
                acc, t_val = self.evaluate_result_flat(self.clusterObj.labels_)
                accuracy.append(acc)
                #select next constraint
                selected_const = None
                if mode=="random":
                    i = random.randrange(0, len(constraints))
                    while constraints[i] in self.applied_constraints:
                        i = random.randrange(0, len(constraints))
                    selected_const = constraints[i]
                    self.applied_constraints.append(selected_const)
                elif mode=="optimal":
                    #start by identifying best possible constraint to apply next
                    temp_df = copy.deepcopy(self.data.unencoded_df_unique_row_id)
                    temp_df["predict"] = self.clusterObj.labels_
                    selected_const = self.identify_best_value_constraint(mapping, temp_df, constraints)
                    self.applied_constraints.append(selected_const)
                #automatically apply selected constraints
                self.append_hier_restriction(selected_const[1:], mapping.index(selected_const[0]))
                #recalc
                t_time = self.calculate_cluster()
                timing.append(t_time)
            acc, mapping = self.evaluate_result_flat(self.clusterObj.labels_)
            accuracy.append(acc)
            #save values of iteration
            ov_const.append(self.applied_constraints)
            ov_acc.append(accuracy)
            ov_timings.append(timing)
            #reset for next iteration
            self.applied_constraints = []
            self.clusterObj = None
            for child in self.children:
                child.hier_restrictions = []
                self.clusterObj = None
        #reset for next iteration
        self.applied_constraints = []
        self.clusterObj = None
        for child in self.children:
            child.hier_restrictions = []
            self.clusterObj = None
        #save result
        aggregated_score = list(map(lambda x: np.average(x), zip(*ov_acc)))
        aggregated_timings = list(map(lambda x: np.average(x), zip(*ov_timings)))
        with open("eval_hiers_res.txt", "a") as f:
            f.write(textwrap.dedent(
                f"""
                ------------------------------------------------------------------------------------------------
                ----------------------------------------------
                Constraint Set Name: {const_name}
                Mode: {mode} flat
                Repetitions: {repetitions}
                ----------------------------------------------
                Accuracy scores: {ov_acc}
                Average Accuracy: {aggregated_score}
                -----------
                Average Timings: {aggregated_timings}
                All Timings: {ov_timings}
                -----------
                Selection order: {ov_const}
                ------------------------------------------------------------------------------------------------
                """
                ))
    
    def generate_hier_evaluation_1(self, c_straints, const_name, mode="random", repetitions=1):
        """ONLY USED for evaluation on test data set triggered by rename starting with eval

        Args:
            mode (str, optional): random|optimal --> constraint selection strategy.
            repetitions (int, optional): number of repetitions that are made end result is avg of all repetitions
        """
        #         possible_constraints = []
        # applied_constraints = []
        # accuracy_values = []
        constraints = [i for i in c_straints if i[0] not in ['sp_enth', 'fo_enth']]
        ov_acc = []
        ov_const = []
        ov_timings = []
        for i in range(repetitions):
            print("at evalutation repetition: " + str(i))
            accuracy = []
            timing = []
            timing.append(self.calculate_cluster())
            acc, garbage = self.evaluate_hier_result_non_flat()
            garbage, mapping_first_level = self.evaluate_result(self.clusterObj.labels_)
            #generate second level mapping
            child_index = mapping_first_level.index("o_enth")
            garbage, mapping_second_level = self.children[child_index].evaluate_hier_result_second_level(self.children[child_index].clusterObj.labels_)
            while len(self.applied_constraints) < len(c_straints):
                print(f"Eval progress: {len(self.applied_constraints)}/{len(c_straints)}")
                #calc current accuracy
                acc, t_val = self.evaluate_hier_result_non_flat()
                accuracy.append(acc)
                #select next constraint
                selected_const = None
                if mode=="random":
                    i = random.randrange(0, len(constraints))
                    while constraints[i] in self.applied_constraints:
                        i = random.randrange(0, len(constraints))
                    selected_const = constraints[i]
                    self.applied_constraints.append(selected_const)
                elif mode=="optimal":
                    #start by identifying best possible constraint to apply next
                    temp_df = copy.deepcopy(self.data.unencoded_df_unique_row_id)
                    temp_df["predict"] = self.clusterObj.labels_
                    #best constraint on first hierarchie level
                    first_level_flag = True
                    candidate_const0, num_violations = self.identify_hier_best_value_constraint(mapping_first_level, temp_df, constraints)
                    #best constraint on second hierarchie level (split of o_enth into 'fo_enth', 'sp_enth')
                    child_index = mapping_first_level.index("o_enth")
                    temp_df2 = copy.deepcopy(self.children[child_index].data.unencoded_df_unique_row_id)
                    temp_df2["predict"] = self.children[child_index].clusterObj.labels_
                    candidate_const1, num_violations1 = self.children[child_index].identify_hier_best_value_constraints_level_two(mapping_second_level, temp_df2, c_straints)
                    first_level_flag = (num_violations>num_violations1)
                #automatically apply selected constraints
                if first_level_flag:
                    self.append_hier_restriction(candidate_const0[1:], mapping_first_level.index(candidate_const0[0]))
                    self.applied_constraints.append(candidate_const0)
                else:
                    self.children[child_index].append_hier_restriction(candidate_const1[1:], mapping_second_level.index(candidate_const1[0]))
                    self.applied_constraints.append(candidate_const1)
                    self.children[child_index].applied_constraints.append(candidate_const1)
                #recalc
                t_time = self.calculate_cluster()
                timing.append(t_time)
            acc, mapping = self.evaluate_hier_result_non_flat()
            #accuracy.append(acc)
            #save values of iteration
            accuracy.append(acc)
            #save values of iteration
            ov_const.append(self.applied_constraints)
            ov_acc.append(accuracy)
            ov_timings.append(timing)
            #reset for next iteration
            self.applied_constraints = []
            self.clusterObj = None
            for child in self.children:
                child.hier_restrictions = []
                child.applied_constraints = []
                child.clusterObj = None
                for ch in child.children:
                    ch.hier_restrictions = []
                    ch.applied_constraints = []
                    ch.clusterObj = None
        #reset for next iteration
        self.applied_constraints = []
        self.clusterObj = None
        for child in self.children:
            child.hier_restrictions = []
            child.applied_constraints = []
            child.clusterObj = None
            for ch in child.children:
                ch.hier_restrictions = []
                ch.applied_constraints = []
                ch.clusterObj = None
        #save result
        aggregated_score = list(map(lambda x: np.average(x), zip(*ov_acc)))
        aggregated_timings = list(map(lambda x: np.average(x), zip(*ov_timings)))
        with open("eval_hiers_res.txt", "a") as f:
            f.write(textwrap.dedent(
                f"""
                ------------------------------------------------------------------------------------------------
                ----------------------------------------------
                Constraint Set Name: {const_name}
                Mode: {mode} with hierarchie test
                Repetitions: {repetitions}
                ----------------------------------------------
                Accuracy scores: {ov_acc}
                Average Accuracy: {aggregated_score}
                -----------
                Average Timings: {aggregated_timings}
                All Timings: {ov_timings}
                -----------
                Selection order: {ov_const}
                ------------------------------------------------------------------------------------------------
                """
                ))
