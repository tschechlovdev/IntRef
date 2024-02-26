#original from jaubsvehla for scikit-learn: https://github.com/datamole-ai/active-semi-supervised-clustering/blob/master/active_semi_clustering/semi_supervised/pairwise_constraints/pckmeans.py
import math
from typing import List
import numpy as np
import random
from .pairwise_constraints import preprocess_constraints
import scipy.sparse as sp
from sklearn.utils.extmath import row_norms, stable_cumsum

# random.seed(8)
# np.random.seed(8)

class PCKMeans:
    #w is penalty for constraint violation
    def __init__(self, n_clusters=3, max_iter=100, w=99999999):
        self.n_clusters = n_clusters
        self.max_iter = max_iter
        self.w = w
        self.att_weights: np.array = None
        #restrictions set for values in clusters
        self.hier_rest: List[List[List[str]]]
        #rows manually assigned by domain expert
        self.manually_assigned = []

    def init_centers(self, X, ml=[], cl=[], recalc=True):
        # Preprocess constraints
        self.ml_graph, self.cl_graph, self.neighborhoods = preprocess_constraints(ml, cl, X.shape[0])

        # Initialize centroids
        self.cluster_centers = self._initialize_cluster_centers(X, self.neighborhoods, recalc)

    def refresh_constraints(self):
        pass

    def fit(self, X, y=None, ml=[], cl=[]):
        self.refresh_constraints()
        # Preprocess constraints
        self.ml_graph, self.cl_graph, self.neighborhoods = preprocess_constraints(ml, cl, X.shape[0])
        ml_graph, cl_graph = self.ml_graph, self.cl_graph

        # Initialize centroids
        cluster_centers = self.cluster_centers

        # Repeat until convergence
        for iteration in range(self.max_iter):
            # Assign clusters
            labels = self._assign_clusters(X, cluster_centers, ml_graph, cl_graph, self.w)

            # Estimate means
            prev_cluster_centers = cluster_centers
            cluster_centers = self._get_cluster_centers(X, labels)

            # Check for convergence
            difference = (prev_cluster_centers - cluster_centers)
            converged = np.allclose(difference, np.zeros(cluster_centers.shape), atol=1e-6, rtol=0)

            if converged: break

        self.cluster_centers_, self.labels_ = cluster_centers, labels

        return self

    def _initialize_cluster_centers(self, X, neighborhoods, recalc=True):
        """_summary_

        Args:
            X (_type_): _description_
            neighborhoods (_type_): _description_
            recalc (bool, optional): if false use previous centers and add new centers until k is reached !only works if num clusters increased fails if decreased num clust

        Returns:
            _type_: _description_
        """
        # neighborhood_centers = np.array([X[neighborhood].mean(axis=0) for neighborhood in neighborhoods])
        # neighborhood_sizes = np.array([len(neighborhood) for neighborhood in neighborhoods])

        # if len(neighborhoods) > self.n_clusters:
        #     # Select K largest neighborhoods' centroids
        #     cluster_centers = neighborhood_centers[np.argsort(neighborhood_sizes)[-self.n_clusters:]]
        # else:
        #     if len(neighborhoods) > 0:
        #         cluster_centers = neighborhood_centers
        #     else:
        #         cluster_centers = np.empty((0, X.shape[1]))

        #     # FIXME look for a point that is connected by cannot-links to every neighborhood set

        #     if len(neighborhoods) < self.n_clusters:
        #         remaining_cluster_centers = X[np.random.choice(X.shape[0], self.n_clusters - len(neighborhoods), replace=False), :]
        #         cluster_centers = np.concatenate([cluster_centers, remaining_cluster_centers])
        if recalc:
            cluster_centers = self.kmeans_plus_plus_init(X, self.n_clusters)
        else:
            cluster_centers = self.kmeans_plus_plus_init(X, self.n_clusters, self.cluster_centers)

        return cluster_centers

    def _objective_function(self, X, x_i, centroids, c_i, labels, ml_graph, cl_graph, w):
        distance = 1 / 2 * np.sum(((X[x_i] - centroids[c_i])*self.att_weights) ** 2)

        ml_penalty = 0
        for y_i in ml_graph[x_i]:
            if labels[y_i] != -1 and labels[y_i] != c_i:
                ml_penalty += w

        cl_penalty = 0
        for y_i in cl_graph[x_i]:
            if labels[y_i] == c_i:
                cl_penalty += w

        #penalty for violating value constraints placed on node
        value_penalty = self._calc_value_penalty(X[x_i], c_i)

        return distance + ml_penalty + cl_penalty + value_penalty

    def _calc_value_penalty(self, x, c_i):
        for val_rest in self.hier_rest[c_i]:
            ev_string = str(x[val_rest[0]]) + val_rest[1] + str(val_rest[2])
            if not eval(ev_string):
                return math.inf
        return 0

    def _assign_clusters(self, X, cluster_centers, ml_graph, cl_graph, w):
        labels = np.full(X.shape[0], fill_value=-1)

        index = list(range(X.shape[0]))
        np.random.shuffle(index)
        for x_i in index:
            x_d = [self._objective_function(X, x_i, cluster_centers, c_i, labels, ml_graph, cl_graph, w) for c_i in range(self.n_clusters)]
            arg_min = np.nanargmin(x_d)
            labels[x_i] = arg_min

        #respect manually assigned nodes --> overwrite result before next centroid estimation
        for cl, row_ids in enumerate(self.manually_assigned):
            for r_id in row_ids:
                labels[r_id] = cl

        # Handle empty clusters
        # See https://github.com/scikit-learn/scikit-learn/blob/0.19.1/sklearn/cluster/_k_means.pyx#L309
        #n_samples_in_cluster = np.bincount(labels, minlength=self.n_clusters)
        #empty_clusters = np.where(n_samples_in_cluster == 0)[0]

        #if len(empty_clusters) > 0:
            #print("Empty clusters")
            #raise EmptyClustersException

        return labels

    def _get_cluster_centers(self, X, labels):
        return np.array([X[labels == i].mean(axis=0) for i in range(self.n_clusters)])

    #kmeans++ centroid initialization taken from kdnuggets with minor adjustment in distance function and param to remember initial centroids from previous clusters to take attribute weights into account
    #original reference: https://www.kdnuggets.com/2020/06/centroid-initialization-k-means-clustering.html
    def kmeans_plus_plus_init(self, ds, k, random_state=42, prev_cent=None):
        """
        Create cluster centroids using the k-means++ algorithm.
        Parameters
        ----------
        ds : numpy array
            The dataset to be used for centroid initialization.
        k : int
            The desired number of clusters for which centroids are required.
        Returns
        -------
        centroids : numpy array
            Collection of k centroids as a numpy array.
        Inspiration from here: https://stackoverflow.com/questions/5466323/how-could-one-implement-the-k-means-algorithm
        """

        np.random.seed(random.randrange(0, 10000))
        centroids = [ds[0]]
        if prev_cent != None:
            centroids = prev_cent

        for _ in range(len(centroids), k):
            dist_sq = np.array([min([np.inner((c-x)*self.att_weights,(c-x)*self.att_weights) for c in centroids]) for x in ds])
            #fix for numpy overflow of numbers (caused by C types)
            dist_sum = sum(map(lambda x: float(x), list(dist_sq)))
            probs = [val/dist_sum for val in dist_sq]
            probs = np.array(probs)
            cumulative_probs = probs.cumsum()
            r = np.random.rand()
            
            for j, p in enumerate(cumulative_probs):
                if r < p:
                    i = j
                    break
            
            centroids.append(ds[i])

        return np.array(centroids)
