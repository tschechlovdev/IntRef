from FeatureFinder.utils import var_diff_for_clusters, sort_values_with_indices, number_rel_features, \
    biggest_differences_features, get_feature_thresholds, median_var_diff


def relevant_feature_per_cluster(clu, header=None):
    """
    Computes the features that are relevant for each cluster (Method 1)
    :param clu: All cluster of the dataset
    :param header: If the header of the dataset shall be used, it is given here as a list of attribute names
    :return: A 2D List. Each 1D List represents the relevant features for one cluster
    """

    all_rel_feat = []

    relevance = var_diff_for_clusters(clu)
    for i in range(len(clu)):
        sorted_diff, sorted_indices_diff = sort_values_with_indices(relevance[i])
        num_rel_feat = number_rel_features(sorted_diff)
        rel_feat = sorted_indices_diff[:num_rel_feat]
        all_rel_feat.append(rel_feat)
        if header is not None:
            for j in range(len(rel_feat)):
                rel_feat[j] = header[rel_feat[j]]

    return all_rel_feat

    # Old implementation of method 2


def features_differentiating_cluster(clu, header=None):
    """
    Computes the features that best differentiate the cluster
    :param clu: All cluster of the dataset
    :param header: If the header of the dataset shall be used, it is given here as a list of attribute names
    :return: A list of these features and a list containing the lowest/highest value each cluster has
    for each of the features
    """



    # TODO Check if correct, So apparently they should be sorted according to a combined metric, which i could not find here
    # First compute the relevant features
    diff = biggest_differences_features(clu)  # only difference to others # TODO: This should be the "combined metric" of page 42, but it is not? It should consist of the Varianz (Streuungsmaß) and a Intersection metric (?). Also everything should be normalized
    sorted_diff, sorted_indices_diff = sort_values_with_indices(diff) # TODO: This should sort according to a previously computed metric
    num_rel_feat = number_rel_features(sorted_diff) # TODO: Use only the most relevant features according to the elbow point
    rel_feat = sorted_indices_diff[:num_rel_feat] # TODO: According to the index of the least most important feature of the previous step, get the features

    # Get the upper/lower thresholds for the features per cluster
    all_t = []
    for d in range(len(clu)):
        thresholds = []
        for f in rel_feat:
            print(f)
            thresholds.append(get_feature_thresholds(clu[d], f))
        all_t.append(thresholds)

        # If a header is given get the names of the computed features
    if header is not None:
        for i in range(len(rel_feat)):
            rel_feat[i] = header[rel_feat[i]]
    return [rel_feat], all_t


def features_differentiating_cluster_new(clu, header=None):
    """
    Computes the features that best differentiate the cluster from all other clusters(Method 2)
    :param clu: All cluster of the dataset
    :param header: If the header of the dataset shall be used, it is given here as a list of attribute names
    :return: A list of these features and a list containing the lowest/highest value each cluster has
            for each of the features
    """
    all_t = []
    all_rel_feat = []

    # Compute the variance-difference of each cluster-feature pair
    diff = var_diff_for_clusters(clu)

    # For each cluster get the most relevant features out of the variance-difference results
    for d in range(len(diff)):

        sorted_diff, sorted_indices_diff = sort_values_with_indices(diff[d])
        num_rel_feat = number_rel_features(sorted_diff)
        rel_feat = sorted_indices_diff[:num_rel_feat]

        # Get the upper/lower thresholds for the features of the current cluster
        thresholds = []
        for f in rel_feat:
            thresholds.append(get_feature_thresholds(clu[d], f))
        all_t.append(thresholds)

        # If a header is given get the names of the computed features
        if header is not None:
            for i in range(len(rel_feat)):
                rel_feat[i] = header[rel_feat[i]]
        all_rel_feat.append(rel_feat)

    return all_rel_feat, all_t


def get_overall_relevant_features(clu, header=None):
    """
    Computes the features that are relevant for the whole dataset/for all cluster (Method 3)
    :param clu: All cluster of the dataset
    :param header: If the header of the dataset shall be used, it is given here as a list of attribute names
    :return: A list of these features
    """

    # Compute overall relevant features for all clusters (as given by kay)
    sorted_values, sorted_indices = median_var_diff(clustering=clu)  # only difference to others
    num_rel_feat = number_rel_features(sorted_values)
    rel_feat = sorted_indices[:num_rel_feat]

    # Get the upper/lower thresholds for the features per cluster
    all_thresholds = []
    for c in clu:
        thresholds = []
        for f in rel_feat:
            thresholds.append(get_feature_thresholds(c, f))
        all_thresholds.append(thresholds)

    # Get the names of the relevant features
    if header is not None:
        for i in range(len(rel_feat)):
            rel_feat[i] = header[rel_feat[i]]

    # Put rel_feat in brackets, to be in line with method 2 formatting,
    # as for method two every cluster has its own features.
    return [rel_feat], all_thresholds, sorted_indices


def get_attribute_thresholds(clu, attributes, header=None):
    """
    Given clustered data and attributes, compute the thresholds for the attributes on the given data
    :param clu: All cluster of the dataset
    :param attributes: The names of the attributes
    :param header: If the header of the dataset shall be used, it is given here as a list of attribute names
    :return: The thresholds of the attributes
    """

    # Get the feature number of the given attribute name
    add_feat = []
    if header is not None:
        add_feat = [i for i in range(len(header)) if header[i] in attributes]

    all_thresholds = []
    for c in clu:
        add_thresholds = []
        for f in add_feat:
            add_thresholds.append(get_feature_thresholds(c, f))
        all_thresholds.append(add_thresholds)

    return all_thresholds


#######################################################################################################################
#######################################################################################################################
# clu = [np.array([[1, 2, 3], [2, 2, 2]]), np.array([[4, 2, 7], [3, 4, 6]]),
#        np.array([[3, 3, 1], [2, 2, 2]]), np.array([[1, 1, 5], [1, 1, 1]])]
"""
cluster, data = ih.read_input('Datasets/students_performance/student-mat_numerical.csv')
clu = ih.create_clusters(cluster, data)
sorted_values, sorted_indices = FeatureFinder.median_var_diff(clustering=clu)
num_rel_feat = FeatureFinder.number_rel_features(sorted_values)
relevant_features = sorted_indices[:num_rel_feat]

print("FOR ALL CLUSTERS COMBINED")
print("Sorted indices by relevance: " + str(sorted_indices))
print("Sorted Relevance: " + str(sorted_values))
print("Number of relevant features: " + str(num_rel_feat))
print("Relevant Features: " + str(relevant_features))
print()

print("FOR EACH CLUSTER SEPARATE")
relevance = FeatureFinder.var_diff_for_clusters(clu)
for i in range(len(clu)):
    print("Relevance Cluster " + str(i) + ": " + str(relevance[i]))
print()

print("BIGGEST DIFFERENCES BETWEEN CLUSTERS")
print("Relevance of all Features: " + str(FeatureFinder.biggest_differences_features(clu)))
"""
