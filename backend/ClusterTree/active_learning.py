from typing import List
import numpy as np
import pandas as pd


from .helpers import get_constraints_from_neighborhoods

#Original https://github.com/datamole-ai/active-semi-supervised-clustering/blob/master/active_semi_clustering/active/pairwise_constraints/explore_consolidate.py
#adapted to use stepwise queries (instead of querying in a loop without interruption) allowing for user feedback in between 
# and weighted distance function
# and adjusted node data
class ExploreConsolidate:
    def __init__(self, node, n_clusters=3, divergence_threshold=5, **kwargs):
        self.n_clusters = n_clusters
        self.neighborhoods = []
        self.node = node
        #over time explore consolidate model can differ from underlying data due to major changes further up in the hierarchie and needs to be reinitialized
        #threshold enables to set the point of reinitialization
        self.divergence_threshold = divergence_threshold
        #stored values exploration step
        self.traversed = []
        self.exploration_phase_finsihed: bool = False
        self.farthest = None
        #current index of exploration loop
        self.neighborhood_index = 0

        #stored values consolidate loop
        self.neighborhoods_union = set()
        self.picked_element = None
        self.sorted_index = 0
    

    def reset(self):
        self.neighborhoods = []
        #stored values exploration step
        self.traversed = []
        self.exploration_phase_finsihed: bool = False
        self.farthest = None
        self.neighborhood_index = 0

    def fit_step(self, oracle=None):
        if oracle != None and oracle.max_queries_cnt <= 0:
            return [], []

        if self.n_clusters != len(self.node.get_children()):
            self.reset()
            self.n_clusters = len(self.node.get_children())
            return self.fit_step()
        if self.n_clusters == 0 or type(self.node.data.df_with_unique_rowid) != pd.DataFrame:
            return None
        if self.node.att_weights == None:
            self.node.att_weights =  [1] * len(self.node.data.get_attributes_of_dataset_no_class())
        if not self.exploration_phase_finsihed:
            return self._explore_step(self.n_clusters)
        else:
            return self._consolidate_step()

    def get_pairwise_const(self):
        """
        Returns:
            List[ml, cl]: returns ml and cannot link constraints
        """
        return get_constraints_from_neighborhoods(self.neighborhoods)

    def _explore_step(self, k):
        temp = self.mapping_madness()
        if len(temp) == 2:
            return temp
        X, true_data_id, m_neighborhoods, m_traversed, m_farthest, orig_n = temp

        X = np.array(X)
        n = len(X)
        

        #if first run initialize
        if len(m_neighborhoods) == 0:
            x = np.random.choice(n)
            m_neighborhoods.append([x])
            self.neighborhoods.append([true_data_id[x]])
            m_traversed.append(x)
            self.traversed.append(true_data_id[x])

        if self.farthest == None:
            max_distance = 0
            m_farthest = None

            for i in range(orig_n):
                if true_data_id[i] not in self.traversed:
                    distance = self.dist(i, m_traversed, X)
                    if distance > max_distance:
                        max_distance = distance
                        m_farthest = i
                        self.farthest = true_data_id[i]
        #return step query
        return [self.neighborhoods[self.neighborhood_index][0], self.farthest]

    def query_answer(self, answ: bool):
        if not self.exploration_phase_finsihed:
            if answ:
                self.neighborhoods[self.neighborhood_index].append(self.farthest)
                self.traversed.append(self.farthest)
                self.farthest = None
            else:
                if self.neighborhood_index < len(self.neighborhoods)-1:
                    self.neighborhood_index += 1
                else:
                    self.neighborhoods.append([self.farthest])
                    self.traversed.append(self.farthest)
            #check if phase change
            if not len(self.neighborhoods) < self.n_clusters:
                self.exploration_phase_finsihed = True
                self.farthest = None
                self.traversed = []
                self.neighborhood_index = 0
        else:
            #in consolidation phase
            if answ:
                self.neighborhoods[self.sorted_index].append(self.picked_element)
                self.neighborhoods_union.add(self.picked_element)
                self.neighborhood_index = 0
                self.picked_element = None
            else:
                if self.neighborhood_index < len(self.neighborhoods)-1:
                    self.neighborhood_index += 1
                    self.neighborhoods_union.add(self.picked_element)
                else:
                    self.neighborhood_index = 0
                    self.picked_element = None



    def mapping_madness(self):
        #get data
        X = list(self.node.data.get_data_as_nparray_no_class())
        #get (tree) unique indexes of data
        true_data_id: List['any'] = self.node.data.get_data_true_id()
        orig_n = len(X)
        #map stored neighborhood and traversed values to true id
        m_neighborhoods = []
        divergence = 0
        for neighborhood in self.neighborhoods:
            m_neighborhood = []
            for neighbor in neighborhood:
                try:
                    #if instacne is stil in parent node this should work
                    index = true_data_id.index(neighbor)
                    m_neighborhood.append(index)
                except:
                    #check if count of instances that need to be mapped from global are within limits
                    divergence += 1
                    if divergence > self.divergence_threshold:
                        self.reset()
                        return self._explore_step(self.n_clusters)
                    #if instance is not in parent node anymore --> map from global data and append to data list
                    g_data = self.node.tree.data
                    g_index = g_data.get_unique_row_id_index(neighbor)
                    if g_index == -1:
                        self.reset()
                        return self._explore_step(self.n_clusters)
                    data = np.array(g_data.df.iloc[g_index].values.tolist()[:-1])
                    X.append(data)
                    true_data_id.append(g_index)
                    m_neighborhood.append(len(true_data_id)-1)
            m_neighborhoods.append(m_neighborhood)

        #same thing for traversed elements
        m_traversed = []
        for elem in self.traversed:
            try:
                #if instacne is stil in parent node this should work
                index = true_data_id.index(elem)
                m_traversed.append(index)
            except:
                #check if count of instances that need to be mapped from global are within limits
                divergence += 0.2
                if divergence > self.divergence_threshold:
                    self.reset()
                    return self._explore_step(self.n_clusters)
                #if instance is not in parent node anymore --> map from global data and append to data list
                g_data = self.node.tree.data
                g_index = g_data.get_unique_row_id_index(elem)
                if g_index == -1:
                    self.reset()
                    return self._explore_step(self.n_clusters)
                data = np.array(g_data.df.iloc[g_index].values.tolist()[:-1])
                X.append(data)
                true_data_id.append(g_index)
                m_traversed.append(len(true_data_id)-1)

        m_farthest = None
        #map farthest
        if self.farthest != None:
            try:
                #if instacne is stil in parent node this should work
                index = true_data_id.index(self.farthest)
                m_farthest = index
            except:
                #check if count of instances that need to be mapped from global are within limits
                divergence += 1
                if divergence > self.divergence_threshold:
                    self.reset()
                    return self._explore_step(self.n_clusters)
                #if instance is not in parent node anymore --> map from global data and append to data list
                g_data = self.node.tree.data
                g_index = g_data.get_unique_row_id_index(self.farthest)
                if g_index == -1:
                    self.reset()
                    return self._explore_step(self.n_clusters)
                data = np.array(g_data.df.iloc[g_index].values.tolist()[:-1])
                X.append(data)
                true_data_id.append(g_index)
                m_farthest.append(len(true_data_id)-1)
        r_val = [X, true_data_id, m_neighborhoods, m_traversed, m_farthest, orig_n]
        return r_val


    def _consolidate_step(self):
        print("now in consolidate not implemented yet")
        temp = self.mapping_madness()
        if len(temp) == 2:
            return temp
        X, true_data_id, m_neighborhoods, m_traversed, m_farthest, orig_n = temp

        if len(self.neighborhoods_union) == 0:
            #initialize neighborhoods_union
            for neighborhood in self.neighborhoods:
                for i in neighborhood:
                    self.neighborhoods_union.add(i)

        if self.picked_element == None:
            remaining = set()
            for i in range(orig_n):
                if true_data_id[i] not in self.neighborhoods_union:
                    remaining.add(true_data_id[i])
                #true data id of picked element
            self.picked_element = np.random.choice(list(remaining))

        try:
            picked_element_index = true_data_id.index(self.picked_element)
        except:
            #true id of picked element does not exist --> add
            true_data_id.append(self.picked_element)
            g_data = self.node.tree.data
            g_index = g_data.get_unique_row_id_index(self.farthest)
            if g_index == -1:
                self.reset()
                return self._explore_step(self.n_clusters)
            X.append(np.array(g_data.df.iloc[g_index].values.tolist()[:-1]))

        n_indices = list(range(len(self.neighborhoods)))
        n_hoods_mixed = list(zip(m_neighborhoods, n_indices))

        sorted_neighborhoods = sorted(n_hoods_mixed, key=lambda neighborhood: self.dist(picked_element_index, neighborhood[0], X))

        self.sorted_index = sorted_neighborhoods[self.neighborhood_index][1]


        return [self.picked_element, self.neighborhoods[self.sorted_index][0]]


    def dist(self, i, S, points):
        distances = np.array([np.sqrt(((points[i] - points[j]*self.node.att_weights) ** 2).sum()) for j in S])
        return distances.min()



