import numpy as np


def var_diff_for_clusters(clustering):
    """
    Calculates the variance-difference for each pair of cluster and feature.
    :param clustering:
    :return: variance-difference per cluster and feature
    """
    number_of_features = 0
    for i in range(len(clustering)):
        if len(clustering[i]) != 0:
            number_of_features = len(clustering[i][0])
    #number_of_features = len(clustering[0][0])
    cluster_var_diff = np.zeros(shape=(len(clustering), number_of_features))
    for clu in range(len(clustering)):
        if len(clustering[clu]) > 0:
            for feat in range(number_of_features):
                total_var = np.var([point for n in range(len(clustering)) if len(clustering[n]) > 0 for point in clustering[n][:, feat]])
                cluster_var = np.var(clustering[clu][:, feat])
                cluster_var_diff[clu, feat] = var_diff(cluster_var, total_var)
    return cluster_var_diff


def median_var_diff(clustering):
    """
    Calculates the variance difference per feature and cluster.
    Calculates the Median-Variance-Difference (Per Feature the Median of all Variance-Differences)

    :param clustering:
    :return: sorted median variance difference, corresponding indices of the features
    """
    cl_var_diff = var_diff_for_clusters(clustering)
    median_array = np.median(cl_var_diff, axis=0)
    sort_index = sorted(range(len(median_array)), key=lambda k: median_array[k])
    sorted_median_array = sorted(median_array)

    return sorted_median_array, sort_index


def number_rel_features(arr):
    """
    Finds the elbow point and returns the number of features before the elbow.
    For a more efficient implementation use log-means

    :param arr:
    :return: number of relevant features
    """
    #  replace 0 by smallest positive float number
    for l in range(len(arr)):
        if arr[l] == 0:
            arr[l] = np.finfo(float).tiny

    best_index_value = 0
    index = -1
    for i in range(len(arr) - 1):
        temp = arr[i] / arr[i + 1]
        if temp > best_index_value:
            best_index_value = temp
            index = i
    return max([index, 1]) #why index, 1 shouldn't this be index, 0?


def biggest_differences_features(clustering):
    """
    Calculates the relevance of the features according to the sum of
    squared differences of the variance differences.

    :param clustering:
    :return: unsorted list of relevance_values per feature
    """
    differences = []
    variance_differences = var_diff_for_clusters(clustering)
    for i in range(len(variance_differences[0])):
        differences.append(sum_of_squared_differences(variance_differences[:, i]))
    return differences


def get_feature_thresholds(cluster, feature):
    """
    Finds the upper and lower threshold a cluster has for a feature
    :param cluster:
    :param feature:
    :return:
    """
    if len(cluster) == 0:
        return [0, 0]
    lower_t = min(cluster[:, feature].tolist())
    upper_t = max(cluster[:, feature].tolist())
    return [lower_t, upper_t]


def var_diff(cluster_variance, total_variance):
    return np.abs(cluster_variance) - np.abs(total_variance)


def sort_values_with_indices(to_sort):
    sort_ind = sorted(range(len(to_sort)), key=lambda k: to_sort[k])
    sorted_array = sorted(to_sort)
    return sorted_array, sort_ind


def sum_of_squared_differences(arr):
    diff = 0
    for i in range(len(arr)):
        for j in range(i + 1, len(arr)):
            diff += (np.abs(arr[i]) - np.abs(arr[j])) ** 2
    return diff

