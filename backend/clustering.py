from sklearn.cluster import DBSCAN
from sklearn.cluster import OPTICS
from sklearn.cluster import KMeans
import numpy as np


def kmeans(data, k):
    prediction = KMeans(n_clusters=k, random_state=1234).fit(data)
    prediction = prediction.predict(data)

    return np.reshape(prediction, (-1, 1))


def dbscan(data, eps, min_samples):
    prediction = DBSCAN(eps=eps, min_samples=min_samples).fit_predict(data)

    return np.reshape(prediction, (-1, 1))


def optics(data, min_samples):
    prediction = OPTICS(min_samples=min_samples).fit_predict(data)

    return np.reshape(prediction, (-1, 1))


def create_clusters(labels, data, hide_noise=False):
    """
    Given data and cluster ids create a data format that conforms with the feature_finder.py module
    :param labels: the cluster ids
    :param data: the data values
    :return: Data that is reformatted according to the clusters: List[ np.array(cluster0 values), np.array(cluster1 values), ... ]
             clusterX values are lists of data values. For DBSCAN and OPTICS the first cluster is cluster "-1" for the noisy data, if hide_noise=False
    """
    clustered_data = []
    if labels is None:
        return None

    for c in labels:
        if c != -1 or not hide_noise: #  Dont use unclustered/noisy data from dbscan&optics
            c_data = []
            for row in data:
                if row[len(row) - 1] == c:
                    c_data.append(row[:len(row) - 1])
            clustered_data.append(np.array(c_data))
    return clustered_data


def cluster(data, algorithm, parameters, labeled=False):
    """
    Clusters the given data with a given clustering algorithm
    :param data: A 2d list of a dataset
    :param algorithm: a string with the clustering algorithm - either kmeans, dbscan or optics
    :param parameters: a list of parameters for the used clustering algorithm
    :param labeled: If True the given data includes the ground truth
    :return: The clustered data 'clu', the majority labels of each cluster, the predicted data labels(/cluster)
    """
    prediction = None
    majority_labels = []

    if labeled:
        labeled_data = data
        unlabeled_data = np.delete(data, -1, axis=1)
    else:
        unlabeled_data = data

    # Cluster data with the given algorithm
    if algorithm == "pckmeans":
        prediction = kmeans(unlabeled_data, parameters[0])
    elif algorithm == "dbscan":
        prediction = dbscan(unlabeled_data, parameters[0], parameters[1])
    elif algorithm == "optics":
        prediction = optics(unlabeled_data, parameters[0])
    # Find the majority class in a cluster
    if labeled:
        labeled_data = np.append(labeled_data, prediction, axis=1)
        labeled_data = create_clusters(np.unique(prediction), labeled_data.tolist())
        print(np.unique(prediction))
        for idx, c in enumerate(labeled_data):
            if idx == 0 and -1 == np.unique(prediction)[idx]:
                majority_labels.append(-1)
            else:
                # The int is needed, as else later on the json.dumps method wont work
                majority_labels.append(int(np.argmax(np.bincount(c[:, -1].astype(int)))))

    # Create the clustered data given the prediction of the used algorithm
    clu = np.append(unlabeled_data, prediction, axis=1)
    clu = create_clusters(np.unique(prediction), clu.tolist(), False)

    return clu, majority_labels, prediction
