/* eslint-disable camelcase */
import filterToMatch, { multiselectFilter } from './metadataMatchers';

export default function () {
  const baseQuery = {
    explain: true,
    _source: {
      include: [
        'title', 'icon', 'processed', 'creationDate', 'template',
        'metadata', 'type', 'sharedId', 'toc', 'attachments',
        'language', 'file', 'uploaded', 'published', 'relationships'
      ]
    },
    from: 0,
    size: 30,
    query: {
      bool: {
        must: [{ bool: { should: [] } }],
        must_not: [],
        filter: [
          { term: { published: true } }
        ]
      }
    },
    sort: [],
    aggregations: {
      all: {
        global: {},
        aggregations: {
          types: {
            terms: {
              field: 'template.raw',
              missing: 'missing',
              size: 9999
            },
            aggregations: {
              filtered: {
                filter: {
                  bool: {
                    must: [{ bool: { should: [] } }],
                    filter: [
                      { match: { published: true } }
                    ]
                  }
                }
              }
            }
          }
        }
      }
    }
  };

  const { aggregations } = baseQuery.aggregations.all;
  const fullTextBool = baseQuery.query.bool.must[0];
  const aggregationsFullTextBool = aggregations.types.aggregations.filtered.filter.bool.must[0];
  function addFullTextFilter(filter) {
    fullTextBool.bool.should.push(filter);
    aggregationsFullTextBool.bool.should.push(filter);
  }

  function addFilter(filter) {
    baseQuery.query.bool.filter.push(filter);
    baseQuery.aggregations.all.aggregations.types.aggregations.filtered.filter.bool.filter.push(filter);
  }

  return {
    query() {
      return baseQuery;
    },

    includeUnpublished() {
      const matchPulished = baseQuery.query.bool.filter.find(i => i.term && i.term.published);
      if (matchPulished) {
        baseQuery.query.bool.filter.splice(baseQuery.query.bool.filter.indexOf(matchPulished), 1);
      }
      return this;
    },

    fullTextSearch(term, fieldsToSearch = ['title', 'fullText'], number_of_fragments = 1, type = 'fvh', fragment_size = 300) {
      if (!term) {
        return this;
      }
      const should = [];
      const includeFullText = fieldsToSearch.includes('fullText');
      const fields = fieldsToSearch.filter(field => field !== 'fullText');
      if (fields.length) {
        should.push({
            query_string: {
              query: term,
              fields,
              boost: 2
          }
        });
      }

      if (includeFullText) {
        const fullTextQuery = {
          has_child: {
            type: 'fullText',
            score_mode: 'max',
            inner_hits: {
              _source: false,
              highlight: {
                order: 'score',
                pre_tags: ['<b>'],
                post_tags: ['</b>'],
                fields: {
                  'fullText_*': {
                    number_of_fragments,
                    type,
                    fragment_size,
                    fragmenter: 'span'
                  },
                }
              }
            },
            query: {
              query_string: {
                query: term,
                fields: ['fullText_*']
              }
            }
          }
        };
        should.unshift(fullTextQuery);
      }

      addFullTextFilter({ bool: { should } });
      return this;
    },

    select(fields) {
      baseQuery._source.include = fields;
      return this;
    },

    language(language) {
      const match = { term: { language } };
      baseQuery.query.bool.filter.push(match);
      aggregations.types.aggregations.filtered.filter.bool.must.push(match);
      return this;
    },

    unpublished() {
      baseQuery.query.bool.filter[0].term.published = false;
      aggregations.types.aggregations.filtered.filter.bool.filter[0].match.published = false;
      return this;
    },

    owner(user) {
      const match = { match: { user: user._id } };
      baseQuery.query.bool.must.push(match);
      return this;
    },

    sort(property, order = 'desc') {
      if (property === '_score') {
        return baseQuery.sort.push('_score');
      }
      const sort = {};
      sort[`${property}.sort`] = { order, unmapped_type: 'boolean' };
      baseQuery.sort.push(sort);
      return this;
    },

    hasMetadataProperties(fieldNames) {
      const match = { bool: { should: [] } };
      match.bool.should = fieldNames.map(field => ({ exists: { field: `metadata.${field}` } }));
      addFilter(match);
      return this;
    },

    filterMetadataByFullText(filters = []) {
      const match = {
        bool: {
          minimum_should_match: 1,
          should: [
          ]
        }
      };
      filters.forEach((filter) => {
        let _match;
        _match = multiselectFilter(filter);
        if (_match) {
          match.bool.should.push(_match);
        }
      });

      if (match.bool.should.length) {
        addFullTextFilter(match);
      }
    },

    filterMetadata(filters = []) {
      filters.forEach((filter) => {
        const match = filterToMatch(filter);
        if (match) {
          addFilter(match);
        }
      });
      return this;
    },

    aggregation(key, should, filters) {
      return {
        terms: {
          field: key,
          missing: 'missing',
          size: 9999
        },
        aggregations: {
          filtered: {
            filter: {
              bool: {
                should,
                filter: filters
              }
            }
          }
        }
      };
    },

    aggregationWithGroupsOfOptions(key, should, filters, dictionary) {
      const aggregation = {
        filters: { filters: {} },
        aggregations: {
          filtered: {
            filter: {
              bool: {
                should,
                filter: filters
              }
            }
          }
        }
      };
      const addMatch = (value) => {
        const match = { terms: {} };
        match.terms[key] = value.values ? value.values.map(v => v.id) : [value.id];
        aggregation.filters.filters[value.id.toString()] = match;
        if (value.values) {
          value.values.forEach(addMatch);
        }
      };
      dictionary.values.forEach(addMatch);

      const missingMatch = { bool: { must_not: { exists: { field: key } } } };
      aggregation.filters.filters.missing = missingMatch;
      return aggregation;
    },

    nestedAggregation(property, should, readOnlyFilters) {
      const nestedAggregation = {
        nested: {
          path: `metadata.${property.name}`
        },
        aggregations: {}
      };
      baseQuery.aggregations[property.name] = nestedAggregation;

      property.nestedProperties.forEach((prop) => {
        const nestedFilters = readOnlyFilters.filter(match => match.nested)
        .map(nestedFilter => nestedFilter.nested.query.bool.must)
        .reduce((result, propFilters) => result.concat(propFilters), []);

        const path = `metadata.${property.name}.${prop}.raw`;
        const filters = JSON.parse(JSON.stringify(readOnlyFilters)).map((match) => {
          if (match.bool && match.bool.must && match.bool.must[0] && match.bool.must[0].nested) {
            match.bool.must = match.bool.must.filter(nestedMatcher => !nestedMatcher.nested ||
              !nestedMatcher.nested.query.bool.must ||
              !nestedMatcher.nested.query.bool.must[0].terms ||
              !nestedMatcher.nested.query.bool.must[0].terms[path] ||
              !nestedMatcher.nested.query.bool.must_not ||
              !nestedMatcher.nested.query.bool.must_not[0].exists ||
              !nestedMatcher.nested.query.bool.must[0].exists.field[path]);

            if (!match.bool.must.length) {
              return;
            }
          }
          return match;
        }).filter(f => f);

        nestedAggregation.aggregations[prop] = {
          terms: {
            field: path,
            missing: 'missing',
            size: 9999
          },
          aggregations: {
            filtered: {
              filter: {
                bool: {
                  must: nestedFilters
                }
              },
              aggregations: {
                total: {
                  reverse_nested: {},
                  aggregations: {
                    filtered: {
                      filter: {
                        bool: {
                          should,
                          must: filters
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        };
      });

      return nestedAggregation;
    },

    aggregations(properties, dictionaries) {
      properties.forEach((property) => {
        const path = `metadata.${property.name}.raw`;
        let filters = baseQuery.query.bool.filter.filter(match => match &&
          (!match.terms || match.terms && !match.terms[path]) &&
          (!match.bool || !match.bool.should || !match.bool.should[1].terms[path]));
        filters = filters.concat(baseQuery.query.bool.must);

        const { should } = baseQuery.query.bool;
        if (property.nested) {
          baseQuery.aggregations.all.aggregations[property.name] = this.nestedAggregation(property, should, filters);
          return;
        }
        let dictionary;
        if (property.content) {
          dictionary = dictionaries.find(d => property.content.toString() === d._id.toString());
        }
        const isADictionaryWithGroups = dictionary && dictionary.values.find(v => v.values);
        if (isADictionaryWithGroups) {
          baseQuery.aggregations.all.aggregations[property.name] = this.aggregationWithGroupsOfOptions(path, should, filters, dictionary);
          return;
        }
        baseQuery.aggregations.all.aggregations[property.name] = this.aggregation(path, should, filters);
      });
      return this;
    },

    filterByTemplate(templates = []) {
      if (templates.includes('missing')) {
        const _templates = templates.filter(t => t !== 'missing');
        const match = {
          bool: {
            should: [
              {
                bool: {
                  must_not: [
                    {
                      exists: {
                        field: 'template'
                      }
                    }
                  ]
                }
              },
              {
                terms: {
                  template: _templates
                }
              }
            ]
          }
        };
        baseQuery.query.bool.filter.push(match);
        return this;
      }

      if (templates.length) {
        const match = { terms: { template: templates } };
        baseQuery.query.bool.filter.push(match);
      }
      return this;
    },

    filterById(ids = []) {
      let _ids;
      if (typeof ids === 'string') {
        _ids = [ids];
      }
      if (Array.isArray(ids)) {
        _ids = ids;
      }
      if (_ids.length) {
        const match = { terms: { 'sharedId.raw': _ids } };
        baseQuery.query.bool.filter.push(match);
      }
      return this;
    },

    highlight(fields) {
      baseQuery.highlight = {
        pre_tags: ['<b>'],
        post_tags: ['</b>']
      };
      baseQuery.highlight.fields = {};
      fields.forEach((field) => {
        baseQuery.highlight.fields[field] = {};
      });
      return this;
    },

    from(from) {
      baseQuery.from = from;
      return this;
    },

    limit(size) {
      baseQuery.size = size;
      return this;
    }
  };
}
